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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit_log
from app.core.auth import (
    AuthenticatedPrincipal,
    get_current_principal,
    get_verified_clerk_claims,
)
from app.core.database import get_db
from app.models.base import new_uuid, utcnow
from app.models.core_models import (
    PlatformRole,
    SellerProfile,
    SellerVerificationApplication,
    User,
    UserAddress,
    UserRoleAssignment,
)
from app.modules.auth.schemas import (
    ArtisanVerificationSubmitRequest,
    ArtisanVerificationSubmitResponse,
    AuthSyncRequest,
    AuthUserProfileResponse,
    SellerProfileBrief,
    UserAddressCreateRequest,
    UserAddressResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication & User Sync"])

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


def _build_user_response(
    db: Session, user: User, *, is_new_user: bool = False
) -> AuthUserProfileResponse:
    role_codes = sorted(
        set(
            db.scalars(
                select(PlatformRole.code)
                .join(
                    UserRoleAssignment,
                    UserRoleAssignment.platform_role_id == PlatformRole.id,
                )
                .where(
                    UserRoleAssignment.user_id == user.id,
                    UserRoleAssignment.assignment_status == "ACTIVE",
                    PlatformRole.is_active == True,  # noqa: E712
                )
            ).all()
        )
    )
    seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == user.id))
    seller_brief = (
        SellerProfileBrief(
            seller_profile_id=seller.id,
            store_name=seller.store_name,
            store_slug=seller.store_slug,
            craft_specialty=seller.craft_specialty,
            workshop_district=seller.workshop_district,
            verification_path=seller.verification_path,
            verification_status=seller.verification_status,
            profile_status=seller.profile_status,
            claimed_gi_authorized_user_no=seller.claimed_gi_authorized_user_no,
        )
        if seller is not None
        else None
    )
    return AuthUserProfileResponse(
        synced=True,
        is_new_user=is_new_user,
        user_id=user.id,
        clerk_user_id=user.clerk_user_id,
        email=user.email,
        email_verified=user.email_verified,
        first_name=user.first_name,
        last_name=user.last_name,
        display_name=user.display_name,
        phone=user.phone,
        account_status=user.account_status,
        roles=role_codes,
        seller_profile=seller_brief,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/sync", response_model=AuthUserProfileResponse)
def sync_authenticated_user(
    payload: AuthSyncRequest,
    request: Request,
    claims: dict = Depends(get_verified_clerk_claims),
    db: Session = Depends(get_db),
) -> AuthUserProfileResponse:
    """Upsert a Clerk-authenticated user into HunarLink's database (`users` + roles).

    Called automatically by the frontend right after Clerk sign-in / sign-up so
    every new Google/Apple/email user exists immediately in MySQL/SQLite.
    """
    clerk_user_id = str(claims["sub"]).strip()
    clean_email = payload.email.strip().lower()
    if "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid email address is required.",
        )

    user = db.scalar(select(User).where(User.clerk_user_id == clerk_user_id))
    is_new_user = False

    if user is None:
        existing_by_email = db.scalar(select(User).where(User.email == clean_email))
        if existing_by_email is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email is already registered under a different identity.",
            )
        is_new_user = True
        first_name = payload.first_name.strip() or clean_email.split("@")[0][:100]
        last_name = (payload.last_name or "").strip() or None
        display_name = (payload.display_name or "").strip() or (
            f"{first_name} {last_name}".strip() if last_name else first_name
        )
        user = User(
            id=new_uuid(),
            clerk_user_id=clerk_user_id,
            email=clean_email,
            email_verified=bool(payload.email_verified),
            phone=(payload.phone or "").strip() or None,
            first_name=first_name[:100],
            last_name=last_name[:100] if last_name else None,
            display_name=display_name[:160],
            preferred_currency="INR",
            account_status="ACTIVE",
        )
        db.add(user)
        db.flush()
    else:
        if user.account_status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is not active (status={user.account_status}).",
            )
        if payload.first_name.strip():
            user.first_name = payload.first_name.strip()[:100]
        if payload.last_name is not None:
            user.last_name = payload.last_name.strip()[:100] or None
        if payload.display_name is not None and payload.display_name.strip():
            user.display_name = payload.display_name.strip()[:160]
        if payload.phone is not None and payload.phone.strip():
            user.phone = payload.phone.strip()[:32]
        if payload.email_verified:
            user.email_verified = True
        user.updated_at = utcnow()

    role_code, role_name = ROLE_CODE_MAP[payload.requested_role]
    _ensure_user_role(db, user.id, role_code, role_name)
    # Artisans can also browse/purchase as customers, while buyers only get CUSTOMER.
    if payload.requested_role == "artisan":
        _ensure_user_role(db, user.id, "CUSTOMER", "Retail Customer")

    record_audit_log(
        db,
        actor_user_id=user.id,
        actor_role=role_code,
        action="USER_SYNC_CREATED" if is_new_user else "USER_SYNC_UPDATED",
        target_type="users",
        target_id=user.id,
        correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
        new_values={
            "requested_role": payload.requested_role,
            "is_new_user": is_new_user,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()
    db.refresh(user)
    return _build_user_response(db, user, is_new_user=is_new_user)


@router.get("/me", response_model=AuthUserProfileResponse)
def get_my_profile(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> AuthUserProfileResponse:
    """Return the authenticated caller's DB profile, roles, and seller status."""
    user = db.scalar(select(User).where(User.id == principal.user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return _build_user_response(db, user, is_new_user=False)


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
) -> ArtisanVerificationSubmitResponse:
    """Persist an authenticated artisan's GI or Standard verification application.

    Note: verification_status is always stored as `SUBMITTED` (never self-approved)
    so platform admins / ASIGS review retain sole authority over GI verification.
    """
    user = db.scalar(select(User).where(User.id == principal.user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if payload.phone and payload.phone.strip():
        user.phone = payload.phone.strip()[:32]
        user.updated_at = utcnow()

    _ensure_user_role(db, user.id, "DIRECT_SELLER", "Direct Artisan Seller")

    seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == user.id))
    if seller is None:
        seller = SellerProfile(
            id=new_uuid(),
            user_id=user.id,
            store_name=payload.store_name.strip(),
            store_slug=_slugify_store(payload.store_name.strip()),
            craft_specialty=payload.craft_specialty.strip(),
            workshop_district=payload.workshop_district.strip(),
            verification_path=payload.verification_path,
            profile_status="DRAFT",
            verification_status="SUBMITTED",
            claimed_gi_authorized_user_no=(payload.claimed_gi_code or "").strip() or None,
        )
        db.add(seller)
        db.flush()
    else:
        seller.store_name = payload.store_name.strip()
        seller.craft_specialty = payload.craft_specialty.strip()
        seller.workshop_district = payload.workshop_district.strip()
        seller.verification_path = payload.verification_path
        seller.claimed_gi_authorized_user_no = (payload.claimed_gi_code or "").strip() or None
        if seller.verification_status != "APPROVED":
            seller.verification_status = "SUBMITTED"

    app_number = f"HL-VER-{utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    application = SellerVerificationApplication(
        id=new_uuid(),
        seller_profile_id=seller.id,
        application_number=app_number,
        verification_path=payload.verification_path,
        application_status="SUBMITTED",
        claimed_gi_code=(payload.claimed_gi_code or "").strip() or None,
        claimed_craft_cluster=payload.workshop_district.strip(),
        submitted_metadata={
            "craft_specialty": payload.craft_specialty.strip(),
            "skill_description": (payload.skill_description or "").strip()[:1000],
        },
    )
    db.add(application)

    record_audit_log(
        db,
        actor_user_id=user.id,
        actor_role="DIRECT_SELLER",
        action="ARTISAN_VERIFICATION_SUBMITTED",
        target_type="seller_verification_applications",
        target_id=application.id,
        correlation_id=getattr(request.state, "correlation_id", "") or str(uuid.uuid4()),
        new_values={
            "application_number": app_number,
            "verification_path": payload.verification_path,
            "workshop_district": payload.workshop_district.strip(),
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    db.commit()
    db.refresh(seller)
    db.refresh(application)

    return ArtisanVerificationSubmitResponse(
        application_id=application.id,
        application_number=application.application_number,
        application_status=application.application_status,
        seller_profile=SellerProfileBrief(
            seller_profile_id=seller.id,
            store_name=seller.store_name,
            store_slug=seller.store_slug,
            craft_specialty=seller.craft_specialty,
            workshop_district=seller.workshop_district,
            verification_path=seller.verification_path,
            verification_status=seller.verification_status,
            profile_status=seller.profile_status,
            claimed_gi_authorized_user_no=seller.claimed_gi_authorized_user_no,
        ),
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
