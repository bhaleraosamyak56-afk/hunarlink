"""Separate Identity Tables & Backfill Helper (`buyer_accounts`, `artisan_accounts`, `admin_accounts`).

Guarantees strict 3-table separation in both SQLite and MySQL 8.4:
  - `buyer_accounts`: Regular retail buyers / collectors ONLY
  - `artisan_accounts`: Kashmiri artisans / workshops ONLY
  - `admin_accounts`: Provisioned platform administrators ONLY

Strict 1-account-type-per-email rule:
  - Every account lives in AT MOST ONE of `buyer_accounts`, `artisan_accounts`, or `admin_accounts`.
  - Pre-existing rows in `users` (if upgrading an older DB) are deterministically backfilled into
    their single appropriate table (`admin_accounts` > `artisan_accounts` > `buyer_accounts`).
"""
from __future__ import annotations

from typing import Literal

from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.core_models import (
    AdminAccount,
    AdminCredential,
    AdminProfile,
    ArtisanAccount,
    BuyerAccount,
    PlatformRole,
    SellerProfile,
    User,
    UserRoleAssignment,
)

AccountTableType = Literal["buyer", "artisan", "admin"]


def ensure_separate_account_tables(engine: Engine) -> None:
    """Ensure `buyer_accounts`, `artisan_accounts`, and `admin_accounts` exist on SQLite/MySQL."""
    BuyerAccount.__table__.create(bind=engine, checkfirst=True)
    ArtisanAccount.__table__.create(bind=engine, checkfirst=True)
    AdminAccount.__table__.create(bind=engine, checkfirst=True)


def lookup_account_type_by_email(
    db: Session, email: str
) -> tuple[AccountTableType | None, BuyerAccount | ArtisanAccount | AdminAccount | None]:
    """Check which dedicated account table owns `email` (strict 1-account-type-per-email)."""
    clean = email.strip().lower()
    admin_acc = db.scalar(select(AdminAccount).where(AdminAccount.email == clean))
    if admin_acc is not None:
        return "admin", admin_acc

    artisan_acc = db.scalar(select(ArtisanAccount).where(ArtisanAccount.email == clean))
    if artisan_acc is not None:
        return "artisan", artisan_acc

    buyer_acc = db.scalar(select(BuyerAccount).where(BuyerAccount.email == clean))
    if buyer_acc is not None:
        return "buyer", buyer_acc

    return None, None


def lookup_account_type_by_id(
    db: Session, account_id: str
) -> tuple[AccountTableType | None, BuyerAccount | ArtisanAccount | AdminAccount | None]:
    """Check which dedicated account table owns `account_id`."""
    admin_acc = db.scalar(select(AdminAccount).where(AdminAccount.id == account_id))
    if admin_acc is not None:
        return "admin", admin_acc

    artisan_acc = db.scalar(select(ArtisanAccount).where(ArtisanAccount.id == account_id))
    if artisan_acc is not None:
        return "artisan", artisan_acc

    buyer_acc = db.scalar(select(BuyerAccount).where(BuyerAccount.id == account_id))
    if buyer_acc is not None:
        return "buyer", buyer_acc

    return None, None


def lookup_clerk_account_by_sub(
    db: Session, clerk_user_id: str
) -> tuple[Literal["buyer", "artisan"] | None, BuyerAccount | ArtisanAccount | None]:
    """Find a Buyer or Artisan strictly from `buyer_accounts` or `artisan_accounts`."""
    artisan_acc = db.scalar(
        select(ArtisanAccount).where(ArtisanAccount.clerk_user_id == clerk_user_id)
    )
    if artisan_acc is not None:
        return "artisan", artisan_acc

    buyer_acc = db.scalar(
        select(BuyerAccount).where(BuyerAccount.clerk_user_id == clerk_user_id)
    )
    if buyer_acc is not None:
        return "buyer", buyer_acc

    return None, None


def backfill_single_user_if_needed(
    db: Session, user: User
) -> tuple[AccountTableType, BuyerAccount | ArtisanAccount | AdminAccount]:
    """Ensure a pre-existing `users` row has its corresponding dedicated table row."""
    existing_type, existing_row = lookup_account_type_by_id(db, user.id)
    if existing_type is not None and existing_row is not None:
        return existing_type, existing_row

    by_email_type, by_email_row = lookup_account_type_by_email(db, user.email)
    if by_email_type is not None and by_email_row is not None:
        return by_email_type, by_email_row

    # 1. Check Admin
    cred = db.scalar(select(AdminCredential).where(AdminCredential.user_id == user.id))
    admin_prof = db.scalar(select(AdminProfile).where(AdminProfile.user_id == user.id))
    role_codes = set(
        db.scalars(
            select(PlatformRole.code)
            .join(UserRoleAssignment, UserRoleAssignment.platform_role_id == PlatformRole.id)
            .where(
                UserRoleAssignment.user_id == user.id,
                UserRoleAssignment.assignment_status == "ACTIVE",
            )
        ).all()
    )
    if cred is not None or admin_prof is not None or "ADMIN" in role_codes:
        admin_acc = AdminAccount(
            id=user.id,
            email=user.email,
            password_hash=cred.password_hash if cred is not None else "REVOKED",
            first_name=user.first_name,
            last_name=user.last_name,
            display_name=user.display_name,
            department=admin_prof.department if admin_prof and admin_prof.department else "Platform Administration",
            account_status=user.account_status,
            is_active=bool(cred.is_active) if cred is not None else (user.account_status == "ACTIVE"),
            last_login_at=(cred.last_login_at if cred else None) or getattr(user, "last_login_at", None),
            created_at=user.created_at or utcnow(),
            updated_at=user.updated_at or utcnow(),
        )
        db.add(admin_acc)
        db.flush()
        return "admin", admin_acc

    # 2. Check Artisan
    seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == user.id))
    if seller is not None or "DIRECT_SELLER" in role_codes:
        artisan_acc = ArtisanAccount(
            id=user.id,
            clerk_user_id=user.clerk_user_id,
            email=user.email,
            email_verified=user.email_verified,
            phone=user.phone,
            first_name=user.first_name,
            last_name=user.last_name,
            display_name=user.display_name,
            store_name=seller.store_name if seller else None,
            craft_specialty=seller.craft_specialty if seller else None,
            workshop_district=seller.workshop_district if seller else None,
            verification_status=seller.verification_status if seller else "UNVERIFIED",
            account_status=user.account_status,
            last_login_at=getattr(user, "last_login_at", None),
            created_at=user.created_at or utcnow(),
            updated_at=user.updated_at or utcnow(),
        )
        db.add(artisan_acc)
        db.flush()
        return "artisan", artisan_acc

    # 3. Default -> Regular Buyer
    buyer_acc = BuyerAccount(
        id=user.id,
        clerk_user_id=user.clerk_user_id,
        email=user.email,
        email_verified=user.email_verified,
        phone=user.phone,
        first_name=user.first_name,
        last_name=user.last_name,
        display_name=user.display_name,
        preferred_currency=user.preferred_currency or "INR",
        account_status=user.account_status,
        last_login_at=getattr(user, "last_login_at", None),
        created_at=user.created_at or utcnow(),
        updated_at=user.updated_at or utcnow(),
    )
    db.add(buyer_acc)
    db.flush()
    return "buyer", buyer_acc


def backfill_all_existing_users(db: Session) -> dict[str, int]:
    """Idempotently partition any unmigrated `users` rows into `buyer_accounts`, `artisan_accounts`, or `admin_accounts`."""
    counts = {"buyers": 0, "artisans": 0, "admins": 0}
    existing_ids = (
        set(db.scalars(select(BuyerAccount.id)).all())
        | set(db.scalars(select(ArtisanAccount.id)).all())
        | set(db.scalars(select(AdminAccount.id)).all())
    )
    unmigrated = db.scalars(select(User).where(User.id.notin_(existing_ids) if existing_ids else True)).all()
    for u in unmigrated:
        acc_type, _ = backfill_single_user_if_needed(db, u)
        if acc_type == "buyer":
            counts["buyers"] += 1
        elif acc_type == "artisan":
            counts["artisans"] += 1
        elif acc_type == "admin":
            counts["admins"] += 1
    return counts
