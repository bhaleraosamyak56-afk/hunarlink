"""Clerk JWT -> HunarLink DB user synchronization & Artisan onboarding endpoints.

Security invariants:
  1. Identity (`clerk_user_id`) comes ONLY from the cryptographically verified
     Clerk RS256 JWT `sub` claim — never from the request body.
  2. Self-sync can ONLY assign `CUSTOMER` or `DIRECT_SELLER` roles; `ADMIN`
     can never be granted via API.
  3. Artisan verification submissions persist `verification_status='SUBMITTED'`
     (never self-assigned `APPROVED`), preserving ASIGS anti-fraud guardrails.
"""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.account_tables import (
    backfill_single_user_if_needed,
    ensure_separate_account_tables,
    lookup_account_type_by_email,
    lookup_account_type_by_id,
    lookup_clerk_account_by_sub,
)
from app.core.admin_security import (
    create_admin_session_token,
    verify_admin_password,
    verify_admin_session_token,
)
from app.core.audit import record_audit_log
from app.core.auth import (
    AuthenticatedPrincipal,
    bearer_scheme,
    get_current_principal,
    get_verified_clerk_claims,
    require_admin_permission,
)
from app.core.cache import (
    invalidate_admin_overview_cache,
    invalidate_artisan_cache,
    invalidate_principal_cache,
    is_admin_token_revoked,
    revoke_admin_token_jti,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import SlidingWindowRateLimiter
from app.models.base import new_uuid, utcnow
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
    RetailOrder,
    SellerDocument,
    SellerProductListing,
    SellerProfile,
    SellerVerificationApplication,
    User,
    UserAddress,
    UserRoleAssignment,
)
from app.models.guardrail_models import FileSecurityScan
from app.modules.auth.schemas import (
    AccountCheckRequest,
    AccountCheckResponse,
    AdminPasswordLoginRequest,
    AdminPasswordLoginResponse,
    ArtisanVerificationSubmitRequest,
    ArtisanVerificationSubmitResponse,
    AuthSyncRequest,
    AuthUserProfileResponse,
    SellerProfileBrief,
    UserAddressCreateRequest,
    UserAddressResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication & User Sync"])
_admin_login_limiter = SlidingWindowRateLimiter(
    max_requests=5, window_seconds=60, scope="admin_login"
)
_auth_sync_limiter = SlidingWindowRateLimiter(
    max_requests=20, window_seconds=60, scope="auth_sync"
)

ROLE_CODE_MAP = {
    "buyer": ("CUSTOMER", "Retail Customer"),
    "artisan": ("DIRECT_SELLER", "Direct Artisan Seller"),
}


def _ensure_platform_role(db: Session, code: str, default_name: str) -> PlatformRole:
    role = db.scalar(select(PlatformRole).where(PlatformRole.code == code))
    if role is None:
        role = PlatformRole(id=new_uuid(), code=code, name=default_name, is_active=True)
        db.add(role)
        db.flush()
    return role


def _ensure_user_role(db: Session, user_id: str, role_code: str, role_name: str) -> None:
    role = _ensure_platform_role(db, role_code, role_name)
    existing = db.scalar(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user_id,
            UserRoleAssignment.platform_role_id == role.id,
        )
    )
    if existing is None:
        db.add(
            UserRoleAssignment(
                id=new_uuid(),
                user_id=user_id,
                platform_role_id=role.id,
                assignment_status="ACTIVE",
                granted_at=utcnow(),
            )
        )
        db.flush()
    elif existing.assignment_status != "ACTIVE":
        existing.assignment_status = "ACTIVE"
        existing.granted_at = utcnow()


def _slugify_store(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "artisan-atelier"
    return f"{base[:150]}-{uuid.uuid4().hex[:6]}"


def _load_admin_access(db: Session, user_id: str, role_codes: list[str]) -> tuple[bool, list[str]]:
    if "ADMIN" not in role_codes:
        return False, []
    admin_profile = db.scalar(
        select(AdminProfile).where(
            AdminProfile.user_id == user_id,
            AdminProfile.admin_status == "ACTIVE",
        )
    )
    if admin_profile is None:
        return False, []
    perms = sorted(
        set(
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
    )
    return True, perms


def _build_seller_brief(db: Session, seller: SellerProfile | None) -> SellerProfileBrief | None:
    if seller is None:
        return None
    latest_app = db.scalar(
        select(SellerVerificationApplication)
        .where(SellerVerificationApplication.seller_profile_id == seller.id)
        .order_by(SellerVerificationApplication.created_at.desc())
        .limit(1)
    )
    meta = (
        latest_app.submitted_metadata
        if latest_app and isinstance(latest_app.submitted_metadata, dict)
        else {}
    )
    return SellerProfileBrief(
        seller_profile_id=seller.id,
        store_name=seller.store_name,
        store_slug=seller.store_slug,
        craft_specialty=seller.craft_specialty,
        workshop_district=seller.workshop_district,
        verification_path=seller.verification_path,
        verification_status=seller.verification_status,
        profile_status=seller.profile_status,
        claimed_gi_authorized_user_no=seller.claimed_gi_authorized_user_no,
        latest_application_id=latest_app.id if latest_app else None,
        latest_application_number=latest_app.application_number if latest_app else None,
        latest_application_status=latest_app.application_status if latest_app else None,
        artisan_card_scan_id=meta.get("artisan_card_scan_id"),
        review_decision_notes=latest_app.review_decision_notes if latest_app else None,
    )


def _build_account_response(
    db: Session,
    acc_type: str,
    account: BuyerAccount | ArtisanAccount | AdminAccount,
    *,
    is_new_user: bool = False,
) -> AuthUserProfileResponse:
    if acc_type == "admin" and isinstance(account, AdminAccount):
        is_admin, admin_permissions = _load_admin_access(db, account.id, ["ADMIN"])
        return AuthUserProfileResponse(
            synced=True,
            is_new_user=is_new_user,
            account_type="admin",
            account_table="admin_accounts",
            user_id=account.id,
            clerk_user_id=f"hl_admin_{account.id[:12]}",
            email=account.email,
            email_verified=True,
            first_name=account.first_name,
            last_name=account.last_name,
            display_name=account.display_name,
            phone=None,
            account_status=account.account_status,
            roles=["ADMIN"],
            is_artisan=False,
            artisan_verified=False,
            is_admin=is_admin,
            admin_permissions=admin_permissions,
            seller_profile=None,
            created_at=account.created_at,
            updated_at=account.updated_at,
        )

    if acc_type == "artisan" and isinstance(account, ArtisanAccount):
        seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == account.id))
        seller_brief = _build_seller_brief(db, seller)
        artisan_verified = bool(
            seller is not None
            and seller.verification_status == "APPROVED"
            and seller.profile_status == "ACTIVE"
        )
        return AuthUserProfileResponse(
            synced=True,
            is_new_user=is_new_user,
            account_type="artisan",
            account_table="artisan_accounts",
            user_id=account.id,
            clerk_user_id=account.clerk_user_id,
            email=account.email,
            email_verified=account.email_verified,
            first_name=account.first_name,
            last_name=account.last_name,
            display_name=account.display_name,
            phone=account.phone,
            account_status=account.account_status,
            roles=["CUSTOMER", "DIRECT_SELLER"],
            is_artisan=True,
            artisan_verified=artisan_verified,
            is_admin=False,
            admin_permissions=[],
            seller_profile=seller_brief,
            created_at=account.created_at,
            updated_at=account.updated_at,
        )

    assert isinstance(account, BuyerAccount)
    return AuthUserProfileResponse(
        synced=True,
        is_new_user=is_new_user,
        account_type="buyer",
        account_table="buyer_accounts",
        user_id=account.id,
        clerk_user_id=account.clerk_user_id,
        email=account.email,
        email_verified=account.email_verified,
        first_name=account.first_name,
        last_name=account.last_name,
        display_name=account.display_name,
        phone=account.phone,
        account_status=account.account_status,
        roles=["CUSTOMER"],
        is_artisan=False,
        artisan_verified=False,
        is_admin=False,
        admin_permissions=[],
        seller_profile=None,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


_account_check_limiter = SlidingWindowRateLimiter(
    max_requests=30, window_seconds=60, scope="check_account"
)


@router.post("/check-account", response_model=AccountCheckResponse)
def check_existing_account(
    payload: AccountCheckRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AccountCheckResponse:
    """Check which dedicated account table (`buyer_accounts`, `artisan_accounts`, `admin_accounts`) owns `email`."""
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = _account_check_limiter.allow(f"check-account:{client_ip}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many account check requests. Retry in {retry_after}s.",
        )

    ensure_separate_account_tables(db.get_bind())
    clean_email = payload.email.strip().lower()
    acc_type, acc_row = lookup_account_type_by_email(db, clean_email)

    if acc_row is None:
        legacy_user = db.scalar(select(User).where(User.email == clean_email))
        if legacy_user is not None:
            acc_type, acc_row = backfill_single_user_if_needed(db, legacy_user)
            db.commit()

    if acc_row is None or acc_type is None:
        return AccountCheckResponse(exists=False)

    if acc_type == "admin":
        return AccountCheckResponse(
            exists=True,
            account_type="admin",
            account_table="admin_accounts",
            roles=["ADMIN"],
            is_artisan=False,
            artisan_verified=False,
            artisan_verification_status=None,
        )

    if acc_type == "artisan":
        seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == acc_row.id))
        return AccountCheckResponse(
            exists=True,
            account_type="artisan",
            account_table="artisan_accounts",
            roles=["CUSTOMER", "DIRECT_SELLER"],
            is_artisan=True,
            artisan_verified=bool(seller is not None and seller.verification_status == "APPROVED"),
            artisan_verification_status=seller.verification_status if seller is not None else "UNVERIFIED",
        )

    return AccountCheckResponse(
        exists=True,
        account_type="buyer",
        account_table="buyer_accounts",
        roles=["CUSTOMER"],
        is_artisan=False,
        artisan_verified=False,
        artisan_verification_status=None,
    )


@router.post("/sync", response_model=AuthUserProfileResponse)
def sync_authenticated_user(
    payload: AuthSyncRequest,
    request: Request,
    claims: dict = Depends(get_verified_clerk_claims),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthUserProfileResponse:
    """Upsert a Clerk-authenticated Buyer or Artisan into its dedicated DB table (`buyer_accounts` or `artisan_accounts`).

    Strict 3-table separation (`buyer_accounts`, `artisan_accounts`, `admin_accounts`) + 1 account type per email:
      - Buyer registrations/logins operate strictly on `buyer_accounts`.
      - Artisan registrations/logins operate strictly on `artisan_accounts`.
      - Attempting to sign in or register an email under a different account type is rejected with HTTP 409 Conflict.
    """
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = _auth_sync_limiter.allow(f"sync:{client_ip}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many account sync requests. Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )

    ensure_separate_account_tables(db.get_bind())
    clerk_user_id = str(claims["sub"]).strip()
    clean_email = payload.email.strip().lower()
    if "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A valid email address is required.",
        )

    target_type = "artisan" if payload.requested_role == "artisan" else "buyer"
    target_table_name = "artisan_accounts" if target_type == "artisan" else "buyer_accounts"

    # Backfill if upgrading from an older DB where `users` existed without dedicated account rows
    acc_by_sub_type, acc_by_sub = lookup_clerk_account_by_sub(db, clerk_user_id)
    if acc_by_sub is None:
        legacy_by_sub = db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
        if legacy_by_sub is not None:
            m_type, m_row = backfill_single_user_if_needed(db, legacy_by_sub)
            db.flush()
            if m_type in ("buyer", "artisan"):
                acc_by_sub_type = m_type  # type: ignore[assignment]
                acc_by_sub = m_row  # type: ignore[assignment]

    acc_by_email_type, acc_by_email = lookup_account_type_by_email(db, clean_email)
    if acc_by_email is None:
        legacy_by_email = db.scalar(select(User).where(User.email == clean_email))
        if legacy_by_email is not None:
            acc_by_email_type, acc_by_email = backfill_single_user_if_needed(db, legacy_by_email)
            db.flush()

    # 1. Strict cross-table isolation: an email or Clerk identity owned by Admin/Artisan/Buyer
    #    CANNOT register or log in as a different account type!
    existing_type = acc_by_sub_type or acc_by_email_type
    if existing_type is not None and existing_type != target_type:
        label_map = {"buyer": "Buyer", "artisan": "Artisan", "admin": "Administrator"}
        owner_label = label_map.get(existing_type, existing_type)
        req_label = label_map.get(target_type, target_type)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This email is registered as an {owner_label} account (stored in `{existing_type}_accounts`) "
                f"and cannot be used as a {req_label} account. Please sign in to the {owner_label} portal or use a separate email."
            ),
        )

    is_new_user = False
    account_row: BuyerAccount | ArtisanAccount

    if acc_by_sub is None:
        if acc_by_email is not None:
            if payload.auth_mode == "signup":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This account already exists in HunarLink. You cannot register again — please log in instead.",
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email is already registered under a different identity.",
            )
        if payload.auth_mode == "signin":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No registered HunarLink {target_type.capitalize()} account found for this email. Please register first.",
            )

        is_new_user = True
        first_name = payload.first_name.strip() or clean_email.split("@")[0][:100]
        last_name = (payload.last_name or "").strip() or None
        display_name = (payload.display_name or "").strip() or (
            f"{first_name} {last_name}".strip() if last_name else first_name
        )
        phone_val = (payload.phone or "").strip()[:32] or None
        new_id = new_uuid()

        # Anchor row for downstream foreign keys (`retail_orders`, `seller_profiles`, `audit_logs`, etc.)
        anchor_user = User(
            id=new_id,
            clerk_user_id=clerk_user_id,
            email=clean_email,
            email_verified=bool(payload.email_verified),
            phone=phone_val,
            first_name=first_name[:100],
            last_name=last_name[:100] if last_name else None,
            display_name=display_name[:160],
            preferred_currency="INR",
            account_status="ACTIVE",
            last_login_at=utcnow(),
        )
        db.add(anchor_user)
        db.flush()

        if target_type == "artisan":
            account_row = ArtisanAccount(
                id=new_id,
                clerk_user_id=clerk_user_id,
                email=clean_email,
                email_verified=bool(payload.email_verified),
                phone=phone_val,
                first_name=first_name[:100],
                last_name=last_name[:100] if last_name else None,
                display_name=display_name[:160],
                verification_status="UNVERIFIED",
                account_status="ACTIVE",
                last_login_at=utcnow(),
            )
        else:
            account_row = BuyerAccount(
                id=new_id,
                clerk_user_id=clerk_user_id,
                email=clean_email,
                email_verified=bool(payload.email_verified),
                phone=phone_val,
                first_name=first_name[:100],
                last_name=last_name[:100] if last_name else None,
                display_name=display_name[:160],
                preferred_currency="INR",
                account_status="ACTIVE",
                last_login_at=utcnow(),
            )
        db.add(account_row)
        db.flush()
    else:
        if payload.auth_mode == "signup":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This account already exists in HunarLink. You cannot register again — please log in instead.",
            )
        if acc_by_sub.account_status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is not active (status={acc_by_sub.account_status}).",
            )
        account_row = acc_by_sub
        anchor_user = db.scalar(select(User).where(User.id == account_row.id))

        if payload.first_name.strip():
            account_row.first_name = payload.first_name.strip()[:100]
            if anchor_user:
                anchor_user.first_name = account_row.first_name
        if payload.last_name is not None:
            account_row.last_name = payload.last_name.strip()[:100] or None
            if anchor_user:
                anchor_user.last_name = account_row.last_name
        if payload.display_name is not None and payload.display_name.strip():
            account_row.display_name = payload.display_name.strip()[:160]
            if anchor_user:
                anchor_user.display_name = account_row.display_name
        if payload.phone is not None and payload.phone.strip():
            account_row.phone = payload.phone.strip()[:32]
            if anchor_user:
                anchor_user.phone = account_row.phone
        if payload.email_verified:
            account_row.email_verified = True
            if anchor_user:
                anchor_user.email_verified = True
        account_row.last_login_at = utcnow()
        account_row.updated_at = utcnow()
        if anchor_user:
            anchor_user.last_login_at = account_row.last_login_at
            anchor_user.updated_at = account_row.updated_at

    role_code, role_name = ROLE_CODE_MAP[target_type]
    if is_new_user or payload.auth_mode != "signin":
        _ensure_user_role(db, account_row.id, role_code, role_name)
        if target_type == "artisan":
            _ensure_user_role(db, account_row.id, "CUSTOMER", "Retail Customer")

    record_audit_log(
        db,
        actor_user_id=account_row.id,
        actor_role=role_code,
        action="USER_SYNC_CREATED" if is_new_user else "USER_SYNC_UPDATED",
        target_type=target_table_name,
        target_id=account_row.id,
        correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
        new_values={
            "requested_role": target_type,
            "account_table": target_table_name,
            "is_new_user": is_new_user,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()
    db.refresh(account_row)
    invalidate_principal_cache(
        clerk_user_id=account_row.clerk_user_id,
        user_id=account_row.id,
        settings=settings,
    )
    invalidate_admin_overview_cache(settings=settings)
    return _build_account_response(db, target_type, account_row, is_new_user=is_new_user)


@router.get("/me", response_model=AuthUserProfileResponse)
def get_my_profile(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> AuthUserProfileResponse:
    """Return the authenticated caller's DB profile strictly from its dedicated account table."""
    ensure_separate_account_tables(db.get_bind())
    acc_type, acc_row = lookup_account_type_by_id(db, principal.user_id)
    if acc_row is None:
        legacy_user = db.scalar(select(User).where(User.id == principal.user_id))
        if legacy_user is not None:
            acc_type, acc_row = backfill_single_user_if_needed(db, legacy_user)
            db.commit()
    if acc_row is None or acc_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    return _build_account_response(db, acc_type, acc_row, is_new_user=False)


@router.post(
    "/artisan-verification",
    response_model=ArtisanVerificationSubmitResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_artisan_verification(
    payload: ArtisanVerificationSubmitRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ArtisanVerificationSubmitResponse:
    """Persist an authenticated artisan's GI or Standard verification application.

    - Standard (`NON_GI` / `STANDARD`) applications require an uploaded Artisan Card
      image/PDF (`artisan_card_scan_id` from `/api/v1/guardrails/documents/upload`) so
      administrators can inspect the physical card in `/admin`.
    - Applications stay staged in `seller_verification_applications` (`SUBMITTED`) with
      `SellerProfile.profile_status='DRAFT'` and `verification_status='SUBMITTED'`
      (excluded from public `/api/v1/artisans`) until an Admin approves them in `/admin`,
      which promotes the record straight into the live verified artisans table.
    """
    ensure_separate_account_tables(db.get_bind())
    artisan_acc = db.scalar(select(ArtisanAccount).where(ArtisanAccount.id == principal.user_id))
    if artisan_acc is None:
        # Check if registered as a Buyer or Admin instead
        other_type, _ = lookup_account_type_by_id(db, principal.user_id)
        if other_type in ("buyer", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Artisan verification is only available for accounts in `artisan_accounts` "
                    f"(your account is stored in `{other_type}_accounts`)."
                ),
            )
        legacy_user = db.scalar(select(User).where(User.id == principal.user_id))
        if legacy_user is not None:
            m_type, m_row = backfill_single_user_if_needed(db, legacy_user)
            db.flush()
            if m_type == "artisan" and isinstance(m_row, ArtisanAccount):
                artisan_acc = m_row
    if artisan_acc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artisan account not found.")

    user = db.scalar(select(User).where(User.id == artisan_acc.id))

    normalized_path = "GI" if payload.verification_path == "GI" else "NON_GI"
    claimed_gi = (payload.claimed_gi_code or "").strip() or None
    card_scan_id = (payload.artisan_card_scan_id or "").strip() or None

    if normalized_path == "GI" and not claimed_gi:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="GI Certified track requires a GI Registration / Authorized User number.",
        )

    scan_row: FileSecurityScan | None = None
    if card_scan_id:
        scan_row = db.scalar(
            select(FileSecurityScan).where(FileSecurityScan.id == card_scan_id)
        )
        if scan_row is None or scan_row.uploader_user_id != artisan_acc.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Uploaded Artisan Card document was not found for your account. Please upload it again.",
            )
        if scan_row.scan_status == "INFECTED":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Uploaded Artisan Card failed security scanning.",
            )
    elif normalized_path == "NON_GI":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Standard Artisan registration requires uploading your Artisan Card image for Admin verification.",
        )

    if payload.phone and payload.phone.strip():
        artisan_acc.phone = payload.phone.strip()[:32]
        if user is not None:
            user.phone = artisan_acc.phone
            user.updated_at = utcnow()

    artisan_acc.store_name = payload.store_name.strip()[:160]
    artisan_acc.craft_specialty = payload.craft_specialty.strip()[:160]
    artisan_acc.workshop_district = payload.workshop_district.strip()[:100]
    artisan_acc.updated_at = utcnow()

    _ensure_user_role(db, artisan_acc.id, "DIRECT_SELLER", "Direct Artisan Seller")

    seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == artisan_acc.id))
    if seller is None:
        seller = SellerProfile(
            id=new_uuid(),
            user_id=artisan_acc.id,
            store_name=payload.store_name.strip(),
            store_slug=_slugify_store(payload.store_name.strip()),
            craft_specialty=payload.craft_specialty.strip(),
            workshop_district=payload.workshop_district.strip(),
            verification_path=normalized_path,
            profile_status="DRAFT",
            verification_status="SUBMITTED",
            claimed_gi_authorized_user_no=claimed_gi,
            bio=(payload.skill_description or "").strip()[:1000] or None,
        )
        db.add(seller)
        db.flush()
    else:
        seller.store_name = payload.store_name.strip()
        seller.craft_specialty = payload.craft_specialty.strip()
        seller.workshop_district = payload.workshop_district.strip()
        seller.verification_path = normalized_path
        seller.claimed_gi_authorized_user_no = claimed_gi
        if payload.skill_description and payload.skill_description.strip():
            seller.bio = payload.skill_description.strip()[:1000]
        if seller.verification_status != "APPROVED":
            seller.verification_status = "SUBMITTED"
            seller.profile_status = "DRAFT"

    artisan_acc.verification_status = seller.verification_status

    app_number = f"HL-VER-{utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    application = SellerVerificationApplication(
        id=new_uuid(),
        seller_profile_id=seller.id,
        application_number=app_number,
        verification_path=normalized_path,
        application_status="SUBMITTED",
        claimed_gi_code=claimed_gi,
        claimed_craft_cluster=payload.workshop_district.strip(),
        submitted_metadata={
            "craft_specialty": payload.craft_specialty.strip(),
            "skill_description": (payload.skill_description or "").strip()[:1000],
            "artisan_card_scan_id": scan_row.id if scan_row else None,
            "artisan_card_filename": scan_row.original_filename if scan_row else None,
            "artisan_card_mime": scan_row.detected_mime_type if scan_row else None,
            "phone": (payload.phone or artisan_acc.phone or "").strip(),
        },
    )
    db.add(application)
    db.flush()

    if scan_row is not None:
        existing_doc = db.scalar(
            select(SellerDocument).where(SellerDocument.storage_key == scan_row.storage_key)
        )
        if existing_doc is None:
            doc_type = "GI_AUTHORIZED_USER_CERT" if normalized_path == "GI" else "IDENTITY_PROOF"
            db.add(
                SellerDocument(
                    id=new_uuid(),
                    seller_profile_id=seller.id,
                    application_id=application.id,
                    document_type=doc_type,
                    storage_key=scan_row.storage_key,
                    original_filename=scan_row.original_filename,
                    detected_mime_type=scan_row.detected_mime_type,
                    file_size_bytes=scan_row.file_size_bytes,
                    sha256_hash=scan_row.sha256_hash,
                    scan_status=scan_row.scan_status if scan_row.scan_status in {"PENDING_SCAN", "CLEAN", "INFECTED", "SCAN_ERROR"} else "CLEAN",
                    verification_status="PENDING",
                    uploaded_by_user_id=artisan_acc.id,
                )
            )
        else:
            existing_doc.application_id = application.id
            existing_doc.verification_status = "PENDING"

    record_audit_log(
        db,
        actor_user_id=artisan_acc.id,
        actor_role="DIRECT_SELLER",
        action="ARTISAN_VERIFICATION_SUBMITTED",
        target_type="seller_verification_applications",
        target_id=application.id,
        correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
        new_values={
            "application_number": app_number,
            "verification_path": normalized_path,
            "workshop_district": payload.workshop_district.strip(),
            "artisan_card_scan_id": scan_row.id if scan_row else None,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()
    db.refresh(seller)
    db.refresh(application)
    invalidate_principal_cache(
        clerk_user_id=artisan_acc.clerk_user_id,
        user_id=artisan_acc.id,
        settings=settings,
    )
    invalidate_artisan_cache(settings=settings)

    brief = _build_seller_brief(db, seller)
    assert brief is not None
    return ArtisanVerificationSubmitResponse(
        application_id=application.id,
        application_number=application.application_number,
        application_status=application.application_status,
        seller_profile=brief,
    )


@router.get("/addresses", response_model=list[UserAddressResponse])
def list_my_addresses(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[UserAddressResponse]:
    rows = db.scalars(
        select(UserAddress)
        .where(UserAddress.user_id == principal.user_id, UserAddress.is_active == True)  # noqa: E712
        .order_by(UserAddress.is_default.desc(), UserAddress.created_at.desc())
    ).all()
    return [
        UserAddressResponse(
            id=a.id,
            address_label=a.address_label,
            recipient_name=a.recipient_name,
            recipient_phone=a.recipient_phone,
            line1=a.line1,
            line2=a.line2,
            city=a.city,
            state_province=a.state_province,
            postal_code=a.postal_code,
            is_default=a.is_default,
            created_at=a.created_at,
        )
        for a in rows
    ]


@router.post("/addresses", response_model=UserAddressResponse, status_code=status.HTTP_201_CREATED)
def create_my_address(
    payload: UserAddressCreateRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> UserAddressResponse:
    existing = db.scalars(
        select(UserAddress).where(
            UserAddress.user_id == principal.user_id,
            UserAddress.is_active == True,  # noqa: E712
        )
    ).all()
    make_default = payload.is_default or len(existing) == 0
    if make_default:
        for row in existing:
            if row.is_default:
                row.is_default = False
        db.flush()

    addr = UserAddress(
        id=new_uuid(),
        user_id=principal.user_id,
        address_label=payload.address_label.strip().upper()[:50],
        recipient_name=payload.recipient_name.strip(),
        recipient_phone=payload.recipient_phone.strip(),
        line1=payload.line1.strip(),
        line2=(payload.line2 or "").strip() or None,
        city=payload.city.strip(),
        state_province=payload.state_province.strip(),
        postal_code=payload.postal_code.strip(),
        country_code="IN",
        is_default=make_default,
        is_active=True,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return UserAddressResponse(
        id=addr.id,
        address_label=addr.address_label,
        recipient_name=addr.recipient_name,
        recipient_phone=addr.recipient_phone,
        line1=addr.line1,
        line2=addr.line2,
        city=addr.city,
        state_province=addr.state_province,
        postal_code=addr.postal_code,
        is_default=addr.is_default,
        created_at=addr.created_at,
    )


@router.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_address(
    address_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> None:
    addr = db.scalar(
        select(UserAddress).where(
            UserAddress.id == address_id,
            UserAddress.user_id == principal.user_id,
            UserAddress.is_active == True,  # noqa: E712
        )
    )
    if addr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found.")
    addr.is_active = False
    addr.is_default = False
    db.commit()


@router.post("/admin-login", response_model=AdminPasswordLoginResponse)
def admin_password_login(
    payload: AdminPasswordLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AdminPasswordLoginResponse:
    """Dedicated login strictly for DB-provisioned Admin accounts (zero self-registration)."""
    normalized_email = payload.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = _admin_login_limiter.allow(f"admin-login:{client_ip}:{normalized_email}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed admin sign-in attempts. Retry in {retry_after}s.",
        )

    # Ensure dedicated tables exist seamlessly
    AdminCredential.__table__.create(bind=db.get_bind(), checkfirst=True)
    ensure_separate_account_tables(db.get_bind())

    cred = db.scalar(
        select(AdminCredential).where(
            AdminCredential.email == normalized_email,
            AdminCredential.is_active == True,  # noqa: E712
        )
    )
    if cred is None or not verify_admin_password(payload.password, cred.password_hash):
        record_audit_log(
            db,
            actor_user_id=None,
            actor_role="ANONYMOUS",
            action="ADMIN_LOGIN_FAILED",
            target_type="admin_accounts",
            target_id=normalized_email,
            correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
            new_values={"ip": client_ip},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrator email or password.",
        )

    admin_acc = db.scalar(select(AdminAccount).where(AdminAccount.id == cred.user_id))
    user = db.scalar(select(User).where(User.id == cred.user_id))
    if admin_acc is None and user is not None:
        m_type, m_row = backfill_single_user_if_needed(db, user)
        db.flush()
        if m_type == "admin" and isinstance(m_row, AdminAccount):
            admin_acc = m_row

    if admin_acc is None or admin_acc.account_status != "ACTIVE" or not admin_acc.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator account is not active.",
        )

    is_admin, admin_permissions = _load_admin_access(db, admin_acc.id, ["ADMIN"])
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges have been revoked for this account.",
        )

    now_ts = utcnow()
    cred.last_login_at = now_ts
    admin_acc.last_login_at = now_ts
    if user is not None:
        user.last_login_at = now_ts
    record_audit_log(
        db,
        actor_user_id=admin_acc.id,
        actor_role="ADMIN",
        action="ADMIN_LOGIN_SUCCESS",
        target_type="admin_accounts",
        target_id=admin_acc.id,
        correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
        new_values={"email": cred.email, "ip": client_ip},
    )
    db.commit()

    token, ttl = create_admin_session_token(
        user_id=admin_acc.id,
        email=cred.email,
        settings=settings,
    )
    return AdminPasswordLoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=ttl,
        user_id=admin_acc.id,
        email=cred.email,
        display_name=admin_acc.display_name or f"{admin_acc.first_name} {admin_acc.last_name or ''}".strip(),
        admin_permissions=admin_permissions,
    )


@router.post("/admin-logout")
def admin_logout(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Revoke the caller's Admin HS256 JWT `jti` immediately in Redis & audit sign-out."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer authentication token.",
        )
    admin_claims = verify_admin_session_token(creds.credentials, settings)
    if admin_claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Administrator token.",
        )
    jti = admin_claims.get("jti")
    user_id = str(admin_claims["sub"])
    if not is_admin_token_revoked(jti, settings=settings):
        revoke_admin_token_jti(
            jti,
            int(admin_claims["exp"]) if admin_claims.get("exp") else None,
            settings=settings,
        )
        invalidate_principal_cache(user_id=user_id, settings=settings)
        record_audit_log(
            db,
            actor_user_id=user_id,
            actor_role="ADMIN",
            action="ADMIN_LOGOUT",
            target_type="admin_credentials",
            target_id=user_id,
            correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
            new_values={"revoked_jti": bool(jti)},
            ip_address=request.client.host if request.client else None,
        )
        db.commit()

    return {"status": "logged_out", "revoked": True, "user_id": user_id}
