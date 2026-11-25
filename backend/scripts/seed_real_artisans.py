"""Idempotent database seeder for verified Kashmiri artisans & craft listings.

Works on BOTH MySQL 8.4 LTS (configured via MYSQL_* in backend/.env) AND local
SQLite (configured via DATABASE_URL=sqlite:///./hunarlink_dev.db).

Usage (from backend/ directory):
    python scripts/seed_real_artisans.py
"""
from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import create_db_engine
from app.models.base import Base, new_uuid, utcnow
from app.models.core_models import (
    Category,
    PlatformRole,
    Product,
    ProductVariant,
    SellerProductListing,
    SellerProfile,
    User,
    UserRoleAssignment,
)

ARTISAN_CATALOG = [
    {
        "clerk_user_id": "clerk_artisan_mir_srinagar",
        "email": "ghulam.mir@hunarlink-guild.in",
        "first_name": "Ghulam Qadir",
        "last_name": "Mir",
        "display_name": "Master Ghulam Qadir Mir",
        "store_name": "Mir Heritage Loom Guild",
        "store_slug": "mir-heritage-loom-guild",
        "craft_specialty": "Kani & Sozni Pashmina Handloom",
        "workshop_district": "Srinagar",
        "verification_path": "GI",
        "gi_code": "GI-JK-PASH-8821",
        "listings": [
            {
                "cat_code": "PASHMINA",
                "cat_slug": "pashmina",
                "cat_name": "Pashmina Textiles",
                "is_gi_cat": True,
                "sku": "HL-PASH-001",
                "slug": "royal-khudrang-pashmina-shawl",
                "title": "Royal Khudrang Pashmina Shawl",
                "desc": "Unbleached natural Khudrang Ladakhi Changthangi pashmina hand-woven on a traditional wooden loom in Srinagar with delicate Sozni hand-embroidered border.",
                "gi_status": "GI_VERIFIED",
                "variant": "Natural Khudrang 205x102cm",
                "price": Decimal("26600.00"),
                "mrp": Decimal("36700.00"),
            },
            {
                "cat_code": "PASHMINA",
                "cat_slug": "pashmina",
                "cat_name": "Pashmina Textiles",
                "is_gi_cat": True,
                "sku": "HL-PASH-002",
                "slug": "jamawar-heirloom-kani-stole",
                "title": "Jamawar Heirloom Kani Stole",
                "desc": "Heirloom Kani-border wrap blending deep forest-emerald field work with traditional Badam paisley motifs, dyed with natural valley indigo.",
                "gi_status": "GI_VERIFIED",
                "variant": "Forest Emerald 200x100cm",
                "price": Decimal("119450.00"),
                "mrp": Decimal("157750.00"),
            },
        ],
    },
    {
        "clerk_user_id": "clerk_artisan_bhat_budgam",
        "email": "nazir.bhat@hunarlink-guild.in",
        "first_name": "Nazir Ahmad",
        "last_name": "Bhat",
        "display_name": "Ustad Nazir Ahmad Bhat",
        "store_name": "Bhat Deodar Pit-Loom Atelier",
        "store_slug": "ustad-nazir-ahmad-bhat",
        "craft_specialty": "Silk-on-Silk Hand-Knotted Carpets",
        "workshop_district": "Budgam",
        "verification_path": "GI",
        "gi_code": "GI-JK-SILK-7729",
        "listings": [
            {
                "cat_code": "SILK_CARPETS",
                "cat_slug": "carpets",
                "cat_name": "Silk-on-Silk Rugs",
                "is_gi_cat": True,
                "sku": "HL-SILK-001",
                "slug": "imperial-silk-on-silk-kashmiri-carpet",
                "title": "Imperial 400-KPSI Silk-on-Silk Carpet",
                "desc": "Pure mulberry silk-on-silk rug hand-knotted at 400 knots per square inch over 14 months on a traditional deodar pit-loom in Budgam.",
                "gi_status": "GI_VERIFIED",
                "variant": "4x6 ft Medallion Ivory",
                "price": Decimal("142400.00"),
                "mrp": Decimal("178000.00"),
            },
        ],
    },
    {
        "clerk_user_id": "clerk_artisan_dar_srinagar",
        "email": "farooq.dar@hunarlink-guild.in",
        "first_name": "Farooq Ahmad",
        "last_name": "Dar",
        "display_name": "Ustad Farooq Ahmad Dar",
        "store_name": "Dar Walnut Woodcarving House",
        "store_slug": "dar-walnut-woodcarving-house",
        "craft_specialty": "Seasoned Walnut Woodcarving",
        "workshop_district": "Srinagar",
        "verification_path": "GI",
        "gi_code": "GI-JK-WALN-4412",
        "listings": [
            {
                "cat_code": "WALNUT_WOOD",
                "cat_slug": "woodwork",
                "cat_name": "Walnut Woodcarving",
                "is_gi_cat": True,
                "sku": "HL-WALN-001",
                "slug": "chinar-deep-carved-walnut-jewelry-chest",
                "title": "Chinar Deep-Carved Walnut Jewellery Chest",
                "desc": "Hand-carved from five-year naturally seasoned Kashmiri walnut wood featuring deep Chinar leaf relief work and velvet lining.",
                "gi_status": "GI_VERIFIED",
                "variant": "Seasoned Root Walnut 30x20cm",
                "price": Decimal("9800.00"),
                "mrp": Decimal("12500.00"),
            },
        ],
    },
    {
        "clerk_user_id": "clerk_artisan_shah_zadibal",
        "email": "manzoor.shah@hunarlink-guild.in",
        "first_name": "Manzoor Hussain",
        "last_name": "Shah",
        "display_name": "Master Manzoor Hussain Shah",
        "store_name": "Zadibal Naqashi Papier-Mache Studio",
        "store_slug": "zadibal-naqashi-studio",
        "craft_specialty": "Sakhta & Naqashi Papier-Mache",
        "workshop_district": "Srinagar",
        "verification_path": "GI",
        "gi_code": "GI-JK-PMAC-3108",
        "listings": [
            {
                "cat_code": "PAPIER_MACHE",
                "cat_slug": "papier-mache",
                "cat_name": "Papier-Mâché Art",
                "is_gi_cat": True,
                "sku": "HL-PMAC-001",
                "slug": "gold-leaf-gul-o-bulbul-papier-mache-vase",
                "title": "24K Gold-Leaf Gul-o-Bulbul Papier-Mâché Vase",
                "desc": "Hand-molded Sakhta pulp vessel finished with traditional Naqashi mineral pigments, real gold leaf detailing, and natural lacquer.",
                "gi_status": "GI_VERIFIED",
                "variant": "12-inch Cobalt & Gold",
                "price": Decimal("6400.00"),
                "mrp": Decimal("8200.00"),
            },
        ],
    },
]


def seed_artisans_and_catalog() -> None:
    settings = get_settings()
    engine = create_db_engine(settings)
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        # Ensure platform roles exist
        role_map: dict[str, PlatformRole] = {}
        for code, name in [
            ("CUSTOMER", "Retail Customer"),
            ("DIRECT_SELLER", "Direct Artisan Seller"),
            ("SUPPLIER", "Craft Supplier"),
            ("DEALER", "Wholesale Dealer"),
            ("ADMIN", "Platform Admin"),
        ]:
            role = db.scalar(select(PlatformRole).where(PlatformRole.code == code))
            if role is None:
                role = PlatformRole(id=new_uuid(), code=code, name=name, is_active=True)
                db.add(role)
                db.flush()
            role_map[code] = role

        added_artisans = 0
        added_listings = 0

        for item in ARTISAN_CATALOG:
            user = db.scalar(select(User).where(User.clerk_user_id == item["clerk_user_id"]))
            if user is None:
                user = User(
                    id=new_uuid(),
                    clerk_user_id=item["clerk_user_id"],
                    email=item["email"],
                    email_verified=True,
                    first_name=item["first_name"],
                    last_name=item["last_name"],
                    display_name=item["display_name"],
                    preferred_currency="INR",
                    account_status="ACTIVE",
                )
                db.add(user)
                db.flush()

            # Ensure DIRECT_SELLER role assignment
            has_role = db.scalar(
                select(UserRoleAssignment).where(
                    UserRoleAssignment.user_id == user.id,
                    UserRoleAssignment.platform_role_id == role_map["DIRECT_SELLER"].id,
                    UserRoleAssignment.assignment_status == "ACTIVE",
                )
            )
            if has_role is None:
                db.add(
                    UserRoleAssignment(
                        id=new_uuid(),
                        user_id=user.id,
                        platform_role_id=role_map["DIRECT_SELLER"].id,
                        assignment_status="ACTIVE",
                        granted_at=utcnow(),
                    )
                )
                db.flush()

            seller = db.scalar(
                select(SellerProfile).where(SellerProfile.store_slug == item["store_slug"])
            ) or db.scalar(select(SellerProfile).where(SellerProfile.user_id == user.id))
            if seller is None:
                seller = SellerProfile(
                    id=new_uuid(),
                    user_id=user.id,
                    store_name=item["store_name"],
                    store_slug=item["store_slug"],
                    craft_specialty=item["craft_specialty"],
                    workshop_district=item["workshop_district"],
                    verification_path=item["verification_path"],
                    profile_status="ACTIVE",
                    verification_status="APPROVED",
                    claimed_gi_authorized_user_no=item["gi_code"],
                )
                db.add(seller)
                db.flush()
                added_artisans += 1
            else:
                if not seller.craft_specialty:
                    seller.craft_specialty = item["craft_specialty"]
                if not seller.workshop_district:
                    seller.workshop_district = item["workshop_district"]
                if not seller.claimed_gi_authorized_user_no:
                    seller.claimed_gi_authorized_user_no = item["gi_code"]
                db.flush()

            for ld in item["listings"]:
                existing_listing = db.scalar(
                    select(SellerProductListing).where(SellerProductListing.seller_sku == ld["sku"])
                )
                if existing_listing is not None:
                    continue

                cat = db.scalar(select(Category).where(Category.code == ld["cat_code"]))
                if cat is None:
                    cat = db.scalar(select(Category).where(Category.slug == ld["cat_slug"]))
                if cat is None:
                    cat = Category(
                        id=new_uuid(),
                        code=ld["cat_code"],
                        name=ld["cat_name"],
                        slug=ld["cat_slug"],
                        is_gi_eligible_category=ld["is_gi_cat"],
                        is_active=True,
                    )
                    db.add(cat)
                    db.flush()

                prod = db.scalar(select(Product).where(Product.slug == ld["slug"]))
                if prod is None:
                    prod = db.scalar(select(Product).where(Product.sku_root == ld["sku"]))
                if prod is None:
                    prod = Product(
                        id=new_uuid(),
                        category_id=cat.id,
                        created_by_user_id=user.id,
                        sku_root=ld["sku"],
                        name=ld["title"],
                        slug=ld["slug"],
                        short_description=ld["desc"][:220],
                        description=ld["desc"],
                        gi_status=ld["gi_status"],
                        approval_status="APPROVED",
                        is_active=True,
                    )
                    db.add(prod)
                    db.flush()

                variant = db.scalar(
                    select(ProductVariant).where(ProductVariant.variant_sku == f"{ld['sku']}-V1")
                )
                if variant is None:
                    variant = ProductVariant(
                        id=new_uuid(),
                        product_id=prod.id,
                        variant_sku=f"{ld['sku']}-V1",
                        variant_name=ld["variant"],
                        base_mrp=ld["mrp"],
                        currency_code="INR",
                        is_active=True,
                    )
                    db.add(variant)
                    db.flush()

                db.add(
                    SellerProductListing(
                        id=new_uuid(),
                        seller_profile_id=seller.id,
                        product_id=prod.id,
                        product_variant_id=variant.id,
                        seller_sku=ld["sku"],
                        listing_title=ld["title"],
                        selling_price=ld["price"],
                        compare_at_mrp=ld["mrp"],
                        currency_code="INR",
                        min_order_qty=1,
                        max_order_qty=10,
                        listing_status="ACTIVE",
                    )
                )
                added_listings += 1

        db.commit()
        print(
            f"Seeded {engine.dialect.name.upper()} DB cleanly: "
            f"+{added_artisans} artisans, +{added_listings} craft listings."
        )


if __name__ == "__main__":
    seed_artisans_and_catalog()
