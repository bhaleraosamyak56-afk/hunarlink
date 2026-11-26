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

from app.core.account_tables import (
    backfill_single_user_if_needed,
    ensure_separate_account_tables,
    lookup_clerk_account_by_sub,
)
from app.core.admin_security import verify_admin_session_token
from app.core.cache import (
    get_cached_principal_dict,
    is_admin_token_revoked,
    set_cached_principal_dict,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models.core_models import (
    AdminAccount,
    AdminCredential,
    AdminPermission,
    AdminProfile,
    AdminRole,
    AdminRolePermission,
    AdminUserRole,
    ArtisanAccount,
    BuyerAccount,
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
    account_table: str = "buyer_accounts"

    def has_role(self, role_code: str) -> bool:
        return role_code in self.roles

    def has_permission(self, permission_code: str) -> bool:
        return self.is_active_admin and permission_code in self.admin_permissions

    def to_cache_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "clerk_user_id": self.clerk_user_id,
            "email": self.email,
            "account_status": self.account_status,
            "roles": sorted(self.roles),
            "admin_permissions": sorted(self.admin_permissions),
            "is_active_admin": bool(self.is_active_admin),
            "account_table": self.account_table,
        }

    @classmethod
    def from_cache_dict(cls, data: dict) -> AuthenticatedPrincipal:
        return cls(
            user_id=str(data["user_id"]),
            clerk_user_id=str(data["clerk_user_id"]),
            email=str(data["email"]),
            account_status=str(data["account_status"]),
            roles=frozenset(data.get("roles") or ()),
            admin_permissions=frozenset(data.get("admin_permissions") or ()),
            is_active_admin=bool(data.get("is_active_admin", False)),
            account_table=str(data.get("account_table") or "buyer_accounts"),
        )


_JWKS_CLIENT_CACHE: dict[str, PyJWKClient] = {}


def _get_jwks_client(jwks_url: str) -> PyJWKClient:
    client = _JWKS_CLIENT_CACHE.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url)
        _JWKS_CLIENT_CACHE[jwks_url] = client
    return client


class ClerkTokenVerifier:
    """Verifies Clerk RS256 session JWTs using Clerk's JWKS endpoint."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._jwks_client: PyJWKClient | None = None

    def verify(self, token: str) -> dict:
        issuer = (self.settings.clerk_issuer or "").strip().rstrip("/")
        jwks_url = (self.settings.clerk_jwks_url or "").strip()
        if not jwks_url or not issuer:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Clerk authentication is not configured on this server.",
            )
        if self._jwks_client is None:
            self._jwks_client = _get_jwks_client(jwks_url)
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token)
            options = {"verify_aud": bool(self.settings.clerk_audience)}
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=issuer,
                audience=self.settings.clerk_audience or None,
                leeway=30,
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


def get_verified_clerk_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    verifier: ClerkTokenVerifier = Depends(get_token_verifier),
) -> dict:
    """Verify the Clerk Bearer JWT and return raw signed claims (for user sync)."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer authentication token.",
        )
    return verifier.verify(creds.credentials)


def load_principal_by_clerk_id(db: Session, clerk_user_id: str) -> AuthenticatedPrincipal:
    ensure_separate_account_tables(db.get_bind())
    acc_type, acc_row = lookup_clerk_account_by_sub(db, clerk_user_id)

    if acc_row is None:
        # Backfill seamlessly if an older DB only had a `users` row before upgrading
        legacy_user = db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
        if legacy_user is not None:
            migrated_type, migrated_row = backfill_single_user_if_needed(db, legacy_user)
            db.commit()
            if migrated_type in ("buyer", "artisan"):
                acc_type = migrated_type  # type: ignore[assignment]
                acc_row = migrated_row  # type: ignore[assignment]

    if acc_row is None or acc_type not in ("buyer", "artisan"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="HunarLink user account not found for authenticated identity.",
        )
    if acc_row.account_status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is not active (status={acc_row.account_status}).",
        )

    role_rows = list(
        db.scalars(
            select(PlatformRole.code)
            .join(UserRoleAssignment, UserRoleAssignment.platform_role_id == PlatformRole.id)
            .where(
                UserRoleAssignment.user_id == acc_row.id,
                UserRoleAssignment.assignment_status == "ACTIVE",
                PlatformRole.is_active == True,  # noqa: E712
            )
        ).all()
    )
    if acc_type == "artisan":
        effective_roles = set(role_rows) | {"DIRECT_SELLER", "CUSTOMER"}
        effective_roles.discard("ADMIN")
        table_name = "artisan_accounts"
    else:
        effective_roles = (set(role_rows) | {"CUSTOMER"}) - {"DIRECT_SELLER", "ADMIN"}
        table_name = "buyer_accounts"

    return AuthenticatedPrincipal(
        user_id=acc_row.id,
        clerk_user_id=acc_row.clerk_user_id,
        email=acc_row.email,
        account_status=acc_row.account_status,
        roles=frozenset(effective_roles),
        admin_permissions=frozenset(),
        is_active_admin=False,
        account_table=table_name,
    )


def load_admin_principal_by_user_id(db: Session, user_id: str) -> AuthenticatedPrincipal:
    """Load an authenticated Admin strictly from `admin_accounts` + RBAC tables."""
    ensure_separate_account_tables(db.get_bind())
    admin_acc = db.scalar(select(AdminAccount).where(AdminAccount.id == user_id))
    if admin_acc is None:
        legacy_user = db.scalar(select(User).where(User.id == user_id))
        if legacy_user is not None:
            m_type, m_row = backfill_single_user_if_needed(db, legacy_user)
            db.commit()
            if m_type == "admin" and isinstance(m_row, AdminAccount):
                admin_acc = m_row

    if admin_acc is None or admin_acc.account_status != "ACTIVE" or not admin_acc.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Administrator account is inactive or not found.",
        )
    cred = db.scalar(
        select(AdminCredential).where(
            AdminCredential.user_id == admin_acc.id,
            AdminCredential.is_active == True,  # noqa: E712
        )
    )
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator credential has been revoked.",
        )

    admin_profile = db.scalar(
        select(AdminProfile).where(
            AdminProfile.user_id == admin_acc.id,
            AdminProfile.admin_status == "ACTIVE",
        )
    )
    if admin_profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges are no longer active.",
        )
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
        user_id=admin_acc.id,
        clerk_user_id=f"hl_admin_{admin_acc.id[:12]}",
        email=admin_acc.email,
        account_status=admin_acc.account_status,
        roles=frozenset({"ADMIN"}),
        admin_permissions=frozenset(perms),
        is_active_admin=True,
        account_table="admin_accounts",
    )


def get_current_principal(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    verifier: ClerkTokenVerifier = Depends(get_token_verifier),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedPrincipal:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer authentication token.",
        )
    # 1. Dedicated HunarLink Admin Email+Password HS256 JWT (strictly verified against DB + jti denylist)
    admin_claims = verify_admin_session_token(creds.credentials, settings)
    if admin_claims is not None:
        if is_admin_token_revoked(admin_claims.get("jti"), settings=settings):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Administrator session has been signed out or revoked.",
            )
        admin_user_id = str(admin_claims["sub"])
        cached_admin = get_cached_principal_dict("admin", admin_user_id, settings=settings)
        if cached_admin is not None:
            principal = AuthenticatedPrincipal.from_cache_dict(cached_admin)
        else:
            principal = load_admin_principal_by_user_id(db, admin_user_id)
            set_cached_principal_dict(
                "admin",
                admin_user_id,
                principal.to_cache_dict(),
                settings=settings,
            )
        request.state.actor_user_id = principal.user_id
        return principal

    # 2. Standard Buyer / Artisan Clerk RS256 JWKS JWT
    claims = verifier.verify(creds.credentials)
    clerk_id = str(claims["sub"])
    cached_principal = get_cached_principal_dict("clerk", clerk_id, settings=settings)
    if cached_principal is not None:
        principal = AuthenticatedPrincipal.from_cache_dict(cached_principal)
    else:
        principal = load_principal_by_clerk_id(db, clerk_id)
        set_cached_principal_dict(
            "clerk",
            clerk_id,
            principal.to_cache_dict(),
            settings=settings,
        )
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
