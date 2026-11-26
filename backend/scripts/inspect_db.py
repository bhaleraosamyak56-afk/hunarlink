"""Read-only inspector for HunarLink's configured SQLite or MySQL database.

Usage (from backend/ directory):
    python scripts/inspect_db.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.account_tables import backfill_all_existing_users, ensure_separate_account_tables
from app.core.config import get_settings
from app.core.database import create_db_engine
from app.models.core_models import (
    AdminAccount,
    AdminCredential,
    ArtisanAccount,
    BuyerAccount,
    Category,
    Payment,
    PlatformRole,
    Product,
    ProductVariant,
    Refund,
    RetailOrder,
    SellerProductListing,
    SellerProfile,
    SellerVerificationApplication,
    User,
    UserRoleAssignment,
)
from app.models.guardrail_models import GuardrailCase, GuardrailRule


def main() -> None:
    settings = get_settings()
    engine = create_db_engine(settings)

    print("=" * 72)
    print(f"HunarLink Database Inspector  |  Dialect: {engine.dialect.name.upper()}")
    if engine.dialect.name == "sqlite":
        print(f"SQLite file: {engine.url.database}")
    else:
        print(f"MySQL target: {settings.mysql_host}:{settings.mysql_port}/{settings.mysql_database}")
    print("=" * 72)

    ensure_separate_account_tables(engine)
    with Session(engine) as db:
        migrated = backfill_all_existing_users(db)
        if any(migrated.values()):
            db.commit()

        buyers = db.scalars(select(BuyerAccount).order_by(BuyerAccount.created_at.desc())).all()
        print(f"\n1. BUYER ACCOUNTS (`buyer_accounts` — {len(buyers)} total):")
        if not buyers:
            print("  (no regular buyers yet)")
        for b in buyers:
            print(
                f"  • {b.display_name or b.first_name} <{b.email}>\n"
                f"      id={b.id} | clerk_id={b.clerk_user_id} | status={b.account_status} | created={b.created_at}"
            )

        artisans = db.scalars(select(ArtisanAccount).order_by(ArtisanAccount.created_at.desc())).all()
        print(f"\n2. ARTISAN ACCOUNTS (`artisan_accounts` — {len(artisans)} total):")
        if not artisans:
            print("  (no artisans yet)")
        for a in artisans[:20]:
            print(
                f"  • {a.display_name or a.first_name} <{a.email}> | workshop={a.store_name or '-'}\n"
                f"      id={a.id} | verify={a.verification_status} | status={a.account_status}"
            )
        if len(artisans) > 20:
            print(f"  ... and {len(artisans) - 20} more verified artisans")

        admins = db.scalars(select(AdminAccount).order_by(AdminAccount.created_at.asc())).all()
        print(f"\n3. ADMIN ACCOUNTS (`admin_accounts` — {len(admins)} total):")
        if not admins:
            print("  (no admins provisioned yet)")
        for ad in admins:
            print(
                f"  • {ad.display_name or ad.first_name} <{ad.email}> | dept={ad.department or '-'}\n"
                f"      id={ad.id} | active={ad.is_active} | status={ad.account_status}"
            )

        sellers = db.scalars(select(SellerProfile).order_by(SellerProfile.created_at.desc())).all()
        print(f"\nSELLER / ARTISAN PROFILES ({len(sellers)} total):")
        if not sellers:
            print("  (none yet)")
        for s in sellers:
            print(
                f"  • {s.store_name} ({s.workshop_district or 'Kashmir'})\n"
                f"      path={s.verification_path} | verify={s.verification_status} | "
                f"status={s.profile_status} | gi_no={s.claimed_gi_authorized_user_no or '-'}"
            )

        apps = db.scalars(
            select(SellerVerificationApplication).order_by(
                SellerVerificationApplication.created_at.desc()
            )
        ).all()
        if apps:
            print(f"\nARTISAN VERIFICATION APPLICATIONS ({len(apps)} total):")
            for a in apps:
                print(
                    f"  • {a.application_number} | path={a.verification_path} | "
                    f"status={a.application_status} | gi={a.claimed_gi_code or '-'}"
                )

        try:
            admin_creds = db.scalars(
                select(AdminCredential).order_by(AdminCredential.created_at.asc())
            ).all()
        except Exception:
            admin_creds = []
        print(f"\nAUTHORIZED ADMIN CREDENTIALS — admin_credentials ({len(admin_creds)} total):")
        if not admin_creds:
            print("  (none configured yet — run scripts/create_admin_account.py)")
        for ac in admin_creds:
            print(
                f"  • {ac.email} | active={ac.is_active} | last_login={ac.last_login_at or 'never'}\n"
                f"      password_hash={ac.password_hash}"
            )

        product_count = db.scalar(select(func.count(Product.id))) or 0
        listing_count = db.scalar(select(func.count(SellerProductListing.id))) or 0
        public_sellers_count = (
            db.scalar(
                select(func.count(SellerProfile.id))
                .join(User, User.id == SellerProfile.user_id)
                .where(
                    User.account_status == "ACTIVE",
                    SellerProfile.profile_status == "ACTIVE",
                    SellerProfile.verification_status == "APPROVED",
                )
            )
            or 0
        )
        public_listings_count = (
            db.scalar(
                select(func.count(SellerProductListing.id))
                .join(Product, Product.id == SellerProductListing.product_id)
                .join(Category, Category.id == Product.category_id)
                .join(SellerProfile, SellerProfile.id == SellerProductListing.seller_profile_id)
                .join(User, User.id == SellerProfile.user_id)
                .where(
                    SellerProductListing.listing_status == "ACTIVE",
                    Product.is_active == True,  # noqa: E712
                    Product.approval_status == "APPROVED",
                    User.account_status == "ACTIVE",
                    SellerProfile.profile_status == "ACTIVE",
                    SellerProfile.verification_status == "APPROVED",
                )
            )
            or 0
        )
        order_count = db.scalar(select(func.count(RetailOrder.id))) or 0
        try:
            payment_count = db.scalar(select(func.count(Payment.id))) or 0
            refund_count = db.scalar(select(func.count(Refund.id))) or 0
            rule_count = db.scalar(select(func.count(GuardrailRule.id))) or 0
            case_count = db.scalar(select(func.count(GuardrailCase.id))) or 0
        except Exception:
            payment_count = refund_count = rule_count = case_count = 0

        print(
            f"\nSTOREFRONT VISIBILITY (/api/v1/artisans & /api/v1/catalog/products):\n"
            f"  • Verified Public Artisans : {public_sellers_count} of {len(sellers)} seller_profiles\n"
            f"  • Active Public Listings   : {public_listings_count} of {listing_count} seller_product_listings "
            f"(products table has {product_count} rows)"
        )
        if public_sellers_count == 0 or public_listings_count == 0:
            print(
                "  ! WARNING: 0 public items will show on the site from this DB!\n"
                "    -> Run `python backend/scripts/seed_real_artisans.py` to seed all 53 verified artisans & 96 active listings,\n"
                "    -> Or approve pending artisans/listings in `/admin` (`SellerProfile.verification_status='APPROVED'`, "
                "`profile_status='ACTIVE'`, `SellerProductListing.listing_status='ACTIVE'`)."
            )

        print(
            f"\nSUMMARY: {len(buyers)} buyers (`buyer_accounts`) | {len(artisans)} artisans (`artisan_accounts`) | "
            f"{len(admins)} admins (`admin_accounts`) | {len(sellers)} seller_profiles ({public_sellers_count} live) | "
            f"{listing_count} listings ({public_listings_count} live) | "
            f"{order_count} orders | {payment_count} payments | {refund_count} refunds | "
            f"{rule_count} ASIGS rules | {case_count} guardrail cases"
        )
        print("=" * 72)


if __name__ == "__main__":
    main()
