"""Idempotent local development SQLite preview seeder for HunarLink FastAPI.

Strictly restricted to non-production SQLite preview databases (e.g.
`DATABASE_URL=sqlite:////tmp/hunarlink_dev.db`) so developers and sandbox
previews can verify real database-backed API endpoints without requiring a
local MySQL daemon. Production deployments MUST use MySQL 8.4 LTS via Alembic
and `hunarlink-database/sql/`.
"""
from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import create_db_engine
from app.models.base import Base, new_uuid
from app.models.core_models import (
    Category,
    PlatformRole,
    Product,
    ProductVariant,
    SellerProductListing,
    SellerProfile,
    User,
)
from app.models.guardrail_models import GuardrailRule


def seed_sqlite_dev_preview() -> None:
    settings = get_settings()
    if settings.app_env == "production":
        raise SystemExit("Refusing to run dev preview seeder in production mode.")

    db_url = settings.database_url or ""
    if not db_url.startswith("sqlite"):
        raise SystemExit(
            "seed_dev_preview.py only targets local SQLite dev URLs "
            "(e.g. DATABASE_URL=sqlite:////tmp/hunarlink_dev.db)."
        )

    engine = create_db_engine(settings)
    Base.metadata.create_all(bind=engine)

    from sqlalchemy.orm import Session

    with Session(engine) as db:
        if db.scalar(select(SellerProductListing.id).limit(1)) is not None:
            print("Dev preview SQLite DB already seeded.")
            return

        for code, name in [
            ("CUSTOMER", "Retail Customer"),
            ("DIRECT_SELLER", "Direct Artisan Seller"),
            ("SUPPLIER", "Craft Supplier"),
            ("DEALER", "Wholesale Dealer"),
            ("ADMIN", "Platform Admin"),
        ]:
            db.add(PlatformRole(id=new_uuid(), code=code, name=name))

        for rule_code, layer, name, outcome in [
            ("PROD_SELLER_CANNOT_SELF_VERIFY_GI", "PRODUCT", "Block seller self-assignment of GI_VERIFIED", "BLOCK"),
            ("COMM_PRICE_ABOVE_MRP", "COMMERCIAL", "Reject selling price exceeding compare-at MRP", "BLOCK"),
            ("DOC_MIME_SIGNATURE_MISMATCH", "DOCUMENT", "Block spoofed document extension vs magic bytes", "BLOCK"),
        ]:
            db.add(
                GuardrailRule(
                    id=new_uuid(),
                    rule_code=rule_code,
                    layer=layer,
                    name=name,
                    default_outcome=outcome,
                    is_active=True,
                    rule_version="1.0.0",
                )
            )

        seller_user = User(
            id=new_uuid(),
            clerk_user_id="clerk_dev_artisan_mir",
            email="artisan.mir@hunarlink.example",
            first_name="Ghulam Qadir",
            last_name="Mir",
            display_name="Master Ghulam Qadir Mir",
            account_status="ACTIVE",
        )
        db.add(seller_user)
        db.flush()

        seller_profile = SellerProfile(
            id=new_uuid(),
            user_id=seller_user.id,
            store_name="Mir Heritage Loom Guild",
            store_slug="mir-heritage-loom-guild",
            verification_path="GI",
            verification_status="APPROVED",
            profile_status="ACTIVE",
        )
        db.add(seller_profile)
        db.flush()

        catalog_seed = [
            (
                "PASH",
                "pashmina",
                "Kashmir Pashmina",
                True,
                "HL-PASH-001",
                "kani-jamawar-pashmina-shawl",
                "Handwoven Kani Jamawar Pashmina Shawl",
                "GI-certified hand-spun Changthangi Pashmina shawl woven on traditional Srinagar Kani looms.",
                "GI_VERIFIED",
                "Natural Ivory 200x100cm",
                Decimal("28500.00"),
                Decimal("24500.00"),
                6,
            ),
            (
                "WALN",
                "walnut",
                "Walnut Wood Carving",
                True,
                "HL-WALN-001",
                "chinar-carved-walnut-jewellery-box",
                "Chinar Motif Hand-Carved Walnut Jewellery Box",
                "Seasoned Kashmiri walnut wood box carved by hand with deep-relief Chinar foliage.",
                "GI_VERIFIED",
                "Satin Wax Finish 24x16cm",
                Decimal("9800.00"),
                Decimal("8400.00"),
                11,
            ),
            (
                "SILK",
                "silk-rugs",
                "Kashmiri Silk Carpets",
                True,
                "HL-SILK-001",
                "hand-knotted-mulberry-silk-carpet",
                "Hand-Knotted Kashmiri Mulberry Silk Carpet (4x6 ft)",
                "324-KPSI hand-knotted mulberry silk rug in Tree-of-Life motif from Budgam master weavers.",
                "GI_VERIFIED",
                "4x6 ft · 324 KPSI",
                Decimal("92000.00"),
                Decimal("78500.00"),
                3,
            ),
        ]

        for (
            cat_code,
            cat_slug,
            cat_name,
            is_gi_cat,
            sku_root,
            prod_slug,
            prod_name,
            prod_desc,
            gi_status,
            variant_name,
            mrp,
            price,
            stock,
        ) in catalog_seed:
            cat = Category(
                id=new_uuid(),
                code=cat_code,
                slug=cat_slug,
                name=cat_name,
                is_gi_eligible_category=is_gi_cat,
                is_active=True,
            )
            db.add(cat)
            db.flush()

            prod = Product(
                id=new_uuid(),
                category_id=cat.id,
                sku_root=sku_root,
                slug=prod_slug,
                name=prod_name,
                description=prod_desc,
                approval_status="APPROVED",
                gi_status=gi_status,
                is_active=True,
            )
            db.add(prod)
            db.flush()

            variant = ProductVariant(
                id=new_uuid(),
                product_id=prod.id,
                variant_sku=f"{sku_root}-V1",
                variant_name=variant_name,
                base_mrp=mrp,
                is_active=True,
            )
            db.add(variant)
            db.flush()

            db.add(
                SellerProductListing(
                    id=new_uuid(),
                    seller_profile_id=seller_profile.id,
                    product_id=prod.id,
                    product_variant_id=variant.id,
                    seller_sku=sku_root,
                    listing_title=prod_name,
                    selling_price=price,
                    compare_at_mrp=mrp,
                    currency_code="INR",
                    min_order_qty=1,
                    max_order_qty=stock,
                    listing_status="ACTIVE",
                )
            )

        db.commit()
        print("Seeded 3 live HunarLink craft listings into dev preview SQLite DB.")


if __name__ == "__main__":
    seed_sqlite_dev_preview()
