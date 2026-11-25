"""Clerk JWT verification (identity only) + HunarLink MySQL RBAC & account checks.

Security rules:
  1. Never trust user IDs, roles, or admin flags supplied in request bodies.
  2. Clerk proves *who* the caller is (`sub` -> `users.clerk_user_id`).
  3. HunarLink MySQL tables (`users`, `user_role_assignments`, `admin_profiles`,
     `admin_user_roles`, `admin_role_permissions`, `admin_permissions`) are the
     sole source of truth for account status, roles, and permissions.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models.core_models import (
    AdminPermission,
    AdminProfile,
    AdminRole,
    AdminRolePermission,
    AdminUserRole,
    PlatformRole,
    User,
    UserRoleAssignment,
)

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    user_id: str
    clerk_user_id: str
    email: str
    account_status: str
    roles: frozenset[str] = field(default_factory=frozenset)
    admin_permissions: frozenset[str] = field(default_factory=frozenset)
    is_active_admin: bool = False

    def has_role(self, role_code: str) -> bool:
        return role_code in self.roles

    def has_permission(self, permission_code: str) -> bool:
        return self.is_active_admin and permission_code in self.admin_permissions


class ClerkTokenVerifier:
    """Verifies Clerk RS256 session JWTs using Clerk's JWKS endpoint."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._jwks_client: PyJWKClient | None = None

    def verify(self, token: str) -> dict:
        if not self.settings.clerk_jwks_url or not self.settings.clerk_issuer:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Clerk authentication is not configured on this server.",
            )
        if self._jwks_client is None:
            self._jwks_client = PyJWKClient(self.settings.clerk_jwks_url)
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            options = {"verify_aud": bool(self.settings.clerk_audience)}
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self.settings.clerk_issuer,
                audience=self.settings.clerk_audience or None,
                options=options,
            )
            if not claims.get("sub"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing subject claim.",
                )
            return claims
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token.",
            )


def get_token_verifier(settings: Settings = Depends(get_settings)) -> ClerkTokenVerifier:
    return ClerkTokenVerifier(settings)


def load_principal_by_clerk_id(db: Session, clerk_user_id: str) -> AuthenticatedPrincipal:
    user = db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="HunarLink user account not found for authenticated identity.",
        )
    if user.account_status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is not active (status={user.account_status}).",
        )

    role_rows = db.scalars(
        select(PlatformRole.code)
        .join(UserRoleAssignment, UserRoleAssignment.platform_role_id == PlatformRole.id)
        .where(
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.assignment_status == "ACTIVE",
            PlatformRole.is_active == True,  # noqa: E712
        )
    ).all()

    admin_profile = db.scalar(
        select(AdminProfile).where(
            AdminProfile.user_id == user.id,
            AdminProfile.admin_status == "ACTIVE",
        )
    )
    perms: list[str] = []
    if admin_profile is not None and "ADMIN" in role_rows:
        perms = list(
            db.scalars(
                select(AdminPermission.code)
                .join(
                    AdminRolePermission,
                    AdminRolePermission.admin_permission_id == AdminPermission.id,
                )
                .join(AdminRole, AdminRole.id == AdminRolePermission.admin_role_id)
                .join(AdminUserRole, AdminUserRole.admin_role_id == AdminRole.id)
                .where(
                    AdminUserRole.admin_profile_id == admin_profile.id,
                    AdminUserRole.is_active == True,  # noqa: E712
                    AdminRole.is_active == True,  # noqa: E712
                )
            ).all()
        )

    return AuthenticatedPrincipal(
        user_id=user.id,
        clerk_user_id=user.clerk_user_id,
        email=user.email,
        account_status=user.account_status,
        roles=frozenset(role_rows),
        admin_permissions=frozenset(perms),
        is_active_admin=admin_profile is not None and "ADMIN" in role_rows,
    )


def get_current_principal(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    verifier: ClerkTokenVerifier = Depends(get_token_verifier),
) -> AuthenticatedPrincipal:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer authentication token.",
        )
    claims = verifier.verify(creds.credentials)
    principal = load_principal_by_clerk_id(db, str(claims["sub"]))
    request.state.actor_user_id = principal.user_id
    return principal


def require_platform_role(*required_roles: str) -> Callable:
    def _dep(
        principal: AuthenticatedPrincipal = Depends(get_current_principal),
    ) -> AuthenticatedPrincipal:
        if not any(principal.has_role(role) for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(required_roles)}.",
            )
        return principal

    return _dep


def require_admin_permission(permission_code: str) -> Callable:
    def _dep(
        principal: AuthenticatedPrincipal = Depends(get_current_principal),
    ) -> AuthenticatedPrincipal:
        if not principal.has_permission(permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required Admin permission: {permission_code}.",
            )
        return principal

    return _dep
