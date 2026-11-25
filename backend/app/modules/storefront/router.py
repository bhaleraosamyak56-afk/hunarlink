"""Authenticated FastAPI storefront router: real DB catalog, artisans & retail orders.

Security rule:
  ALL catalog, artisan, and order endpoints require a verified Clerk RS256 JWT
  mapped to an active user in HunarLink's database (`get_current_principal`).
  No unauthenticated visitor can access marketplace or artisan APIs.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedPrincipal, get_current_principal, require_admin_permission
from app.core.database import get_db
from app.models.base import new_uuid, utcnow
from app.models.core_models import (
    AdminCredential,
    Category,
    Product,
    ProductVariant,
    RetailOrder,
    RetailOrderItem,
    SellerFulfilmentGroup,
    SellerProductListing,
    SellerProfile,
    User,
)
from app.modules.storefront.schemas import (
    ArtisanDetailResponse,
    ArtisanSummaryItem,
    CatalogProductItem,
    CreateRetailOrderRequest,
    RetailOrderItemSummary,
    RetailOrderSummaryResponse,
)

router = APIRouter(tags=["Storefront, Artisans & Retail Orders"])


def _serialize_catalog_row(
    listing: SellerProductListing,
    product: Product,
    category: Category,
    seller: SellerProfile,
    artisan_user: User | None,
) -> CatalogProductItem:
    artisan_name = (
        (artisan_user.display_name or f"{artisan_user.first_name} {artisan_user.last_name or ''}".strip())
        if artisan_user is not None
        else seller.store_name
    )
    return CatalogProductItem(
        listing_id=listing.id,
        product_id=product.id,
        product_variant_id=listing.product_variant_id,
        seller_profile_id=seller.id,
        seller_sku=listing.seller_sku,
        product_slug=product.slug,
        title=listing.listing_title,
        description=product.description,
        category_slug=category.slug,
        category_name=category.name,
        store_name=seller.store_name,
        artisan_name=artisan_name,
        artisan_slug=seller.store_slug,
        workshop_district=seller.workshop_district,
        craft_specialty=seller.craft_specialty,
        verification_path=seller.verification_path,
        verification_status=seller.verification_status,
        claimed_gi_code=seller.claimed_gi_authorized_user_no,
        selling_price=listing.selling_price,
        compare_at_mrp=listing.compare_at_mrp,
        currency_code=listing.currency_code,
        min_order_qty=listing.min_order_qty,
        max_order_qty=listing.max_order_qty,
        gi_status=product.gi_status,
    )


@router.get("/catalog/products", response_model=list[CatalogProductItem])
def list_active_catalog_products(
    category_slug: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[CatalogProductItem]:
    """Return active, approved marketplace listings from the DB for public browsing."""
    safe_limit = max(1, min(limit, 200))
    stmt = (
        select(SellerProductListing, Product, Category, SellerProfile, User)
        .join(Product, Product.id == SellerProductListing.product_id)
        .join(Category, Category.id == Product.category_id)
        .join(SellerProfile, SellerProfile.id == SellerProductListing.seller_profile_id)
        .join(User, User.id == SellerProfile.user_id)
        .where(
            SellerProductListing.listing_status == "ACTIVE",
            Product.is_active == True,  # noqa: E712
            Product.approval_status == "APPROVED",
            SellerProfile.profile_status == "ACTIVE",
            SellerProfile.verification_status == "APPROVED",
        )
        .order_by(SellerProductListing.created_at.desc())
        .limit(safe_limit)
    )
    if category_slug:
        stmt = stmt.where(Category.slug == category_slug.strip())

    rows = db.execute(stmt).all()
    return [
        _serialize_catalog_row(listing, product, category, seller, artisan_user)
        for listing, product, category, seller, artisan_user in rows
    ]


@router.get("/artisans", response_model=list[ArtisanSummaryItem])
def list_verified_artisans(
    db: Session = Depends(get_db),
) -> list[ArtisanSummaryItem]:
    """Return verified/active artisans strictly from the database for public browsing."""
    sellers = db.execute(
        select(SellerProfile, User)
        .join(User, User.id == SellerProfile.user_id)
        .where(
            SellerProfile.profile_status == "ACTIVE",
            SellerProfile.verification_status == "APPROVED",
        )
        .order_by(SellerProfile.created_at.desc())
    ).all()

    results: list[ArtisanSummaryItem] = []
    for seller, artisan_user in sellers:
        listing_rows = db.execute(
            select(SellerProductListing, Category)
            .join(Product, Product.id == SellerProductListing.product_id)
            .join(Category, Category.id == Product.category_id)
            .where(
                SellerProductListing.seller_profile_id == seller.id,
                SellerProductListing.listing_status == "ACTIVE",
                Product.is_active == True,  # noqa: E712
                Product.approval_status == "APPROVED",
            )
        ).all()
        prices = [Decimal(l.selling_price) for l, _ in listing_rows]
        cats = sorted({c.name for _, c in listing_rows})
        name = artisan_user.display_name or f"{artisan_user.first_name} {artisan_user.last_name or ''}".strip()
        results.append(
            ArtisanSummaryItem(
                seller_profile_id=seller.id,
                slug=seller.store_slug,
                name=name,
                store_name=seller.store_name,
                craft_specialty=seller.craft_specialty,
                workshop_district=seller.workshop_district,
                verification_path=seller.verification_path,
                verification_status=seller.verification_status,
                profile_status=seller.profile_status,
                claimed_gi_code=seller.claimed_gi_authorized_user_no,
                listing_count=len(listing_rows),
                starting_price=min(prices) if prices else None,
                categories=cats,
            )
        )
    return results


@router.get("/artisans/{slug}", response_model=ArtisanDetailResponse)
def get_verified_artisan_by_slug(
    slug: str,
    db: Session = Depends(get_db),
) -> ArtisanDetailResponse:
    """Return a single verified artisan + their real DB listings for public browsing."""
    row = db.execute(
        select(SellerProfile, User)
        .join(User, User.id == SellerProfile.user_id)
        .where(
            SellerProfile.store_slug == slug.strip(),
            SellerProfile.profile_status == "ACTIVE",
            SellerProfile.verification_status == "APPROVED",
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artisan not found.")

    seller, artisan_user = row
    listing_rows = db.execute(
        select(SellerProductListing, Product, Category)
        .join(Product, Product.id == SellerProductListing.product_id)
        .join(Category, Category.id == Product.category_id)
        .where(
            SellerProductListing.seller_profile_id == seller.id,
            SellerProductListing.listing_status == "ACTIVE",
            Product.is_active == True,  # noqa: E712
            Product.approval_status == "APPROVED",
        )
        .order_by(SellerProductListing.created_at.desc())
    ).all()

    serialized = [
        _serialize_catalog_row(listing, product, category, seller, artisan_user)
        for listing, product, category in listing_rows
    ]
    prices = [Decimal(l.selling_price) for l, _, _ in listing_rows]
    cats = sorted({c.name for _, _, c in listing_rows})
    name = artisan_user.display_name or f"{artisan_user.first_name} {artisan_user.last_name or ''}".strip()

    return ArtisanDetailResponse(
        seller_profile_id=seller.id,
        slug=seller.store_slug,
        name=name,
        store_name=seller.store_name,
        craft_specialty=seller.craft_specialty,
        workshop_district=seller.workshop_district,
        verification_path=seller.verification_path,
        verification_status=seller.verification_status,
        profile_status=seller.profile_status,
        claimed_gi_code=seller.claimed_gi_authorized_user_no,
        listing_count=len(serialized),
        starting_price=min(prices) if prices else None,
        categories=cats,
        listings=serialized,
    )


def _serialize_order(order: RetailOrder, items: list[RetailOrderItem]) -> RetailOrderSummaryResponse:
    snap = order.shipping_address_snapshot_json if isinstance(order.shipping_address_snapshot_json, dict) else {}
    return RetailOrderSummaryResponse(
        order_id=order.id,
        order_number=order.order_number,
        order_scope="RETAIL",
        payment_method=order.payment_method,
        payment_label=snap.get("payment_label"),
        payment_status=order.payment_status,
        fulfilment_status=order.fulfilment_status,
        currency_code=order.currency_code,
        subtotal_amount=order.subtotal_amount,
        discount_amount=order.discount_amount,
        tax_amount=order.tax_amount,
        shipping_fee=order.shipping_fee,
        total_amount=order.total_amount,
        item_count=sum(i.quantity for i in items),
        shipping_address=snap,
        items=[
            RetailOrderItemSummary(
                product_id=i.product_id,
                seller_listing_id=i.seller_listing_id,
                title=i.product_name_snapshot,
                sku=i.sku_snapshot,
                gi_status=i.gi_status_snapshot,
                quantity=i.quantity,
                unit_price=i.unit_price_snapshot,
                line_total=i.line_total_amount,
            )
            for i in items
        ],
        created_at=order.created_at,
    )


@router.post(
    "/orders/retail",
    response_model=RetailOrderSummaryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_retail_order_from_cart(
    payload: CreateRetailOrderRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> RetailOrderSummaryResponse:
    """Create a server-validated RetailOrder whose totals come strictly from DB prices."""
    grouped_lines: dict[str, list[tuple[SellerProductListing, Product, ProductVariant, int, Decimal]]] = defaultdict(list)
    order_subtotal = Decimal("0.00")

    for req_item in payload.items:
        listing = db.scalar(
            select(SellerProductListing).where(SellerProductListing.id == req_item.seller_listing_id)
        )
        if listing is None or listing.listing_status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Listing '{req_item.seller_listing_id}' is unavailable or inactive.",
            )
        if listing.currency_code.upper() != "INR":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only INR retail listings are supported.",
            )

        seller = db.scalar(select(SellerProfile).where(SellerProfile.id == listing.seller_profile_id))
        if seller is None or seller.profile_status != "ACTIVE" or seller.verification_status != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Seller for one of the requested items is not active and verified.",
            )

        product = db.scalar(select(Product).where(Product.id == listing.product_id))
        variant = db.scalar(select(ProductVariant).where(ProductVariant.id == listing.product_variant_id))
        if product is None or not product.is_active or product.approval_status != "APPROVED" or variant is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Referenced product or variant is inactive or unapproved.",
            )

        if req_item.quantity < listing.min_order_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Quantity for '{listing.listing_title}' must be at least {listing.min_order_qty}.",
            )
        if listing.max_order_qty is not None and req_item.quantity > listing.max_order_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Quantity for '{listing.listing_title}' cannot exceed {listing.max_order_qty}.",
            )

        line_total = (Decimal(listing.selling_price) * Decimal(req_item.quantity)).quantize(Decimal("0.01"))
        order_subtotal += line_total
        grouped_lines[seller.id].append((listing, product, variant, req_item.quantity, line_total))

    is_cod = payload.payment_method == "COD"
    addr_snap = payload.shipping_address.model_dump(mode="json")
    if payload.payment_label:
        addr_snap["payment_label"] = payload.payment_label.strip()

    order = RetailOrder(
        id=new_uuid(),
        order_number=f"HL-RET-{uuid.uuid4().hex[:8].upper()}",
        customer_user_id=principal.user_id,
        shipping_address_snapshot_json=addr_snap,
        currency_code="INR",
        subtotal_amount=order_subtotal,
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        shipping_fee=Decimal("0.00"),
        total_amount=order_subtotal,
        payment_method=payload.payment_method,
        payment_status="COD_PENDING" if is_cod else "PENDING",
        fulfilment_status="CONFIRMED" if is_cod else "PENDING_PAYMENT",
        confirmed_at=utcnow() if is_cod else None,
    )
    db.add(order)
    db.flush()

    created_items: list[RetailOrderItem] = []
    for seller_profile_id, seller_items in grouped_lines.items():
        group_sub = sum((lt for _, _, _, _, lt in seller_items), Decimal("0.00")).quantize(Decimal("0.01"))
        group = SellerFulfilmentGroup(
            id=new_uuid(),
            fulfilment_number=f"FG-{uuid.uuid4().hex[:8].upper()}",
            retail_order_id=order.id,
            seller_profile_id=seller_profile_id,
            currency_code="INR",
            subtotal_amount=group_sub,
            group_total_amount=group_sub,
            fulfilment_status=order.fulfilment_status,
        )
        db.add(group)
        db.flush()

        for listing, product, variant, qty, line_total in seller_items:
            row = RetailOrderItem(
                id=new_uuid(),
                retail_order_id=order.id,
                seller_fulfilment_group_id=group.id,
                seller_listing_id=listing.id,
                product_id=product.id,
                product_variant_id=variant.id,
                product_name_snapshot=listing.listing_title,
                sku_snapshot=variant.variant_sku,
                gi_status_snapshot=product.gi_status,
                quantity=qty,
                unit_price_snapshot=listing.selling_price,
                line_total_amount=line_total,
                currency_code="INR",
            )
            db.add(row)
            created_items.append(row)

    db.commit()
    return _serialize_order(order, created_items)


@router.get("/orders/retail/my", response_model=list[RetailOrderSummaryResponse])
def list_my_retail_orders(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[RetailOrderSummaryResponse]:
    orders = list(
        db.scalars(
            select(RetailOrder)
            .where(RetailOrder.customer_user_id == principal.user_id)
            .order_by(RetailOrder.created_at.desc())
            .limit(50)
        ).all()
    )
    results: list[RetailOrderSummaryResponse] = []
    for order in orders:
        items = list(
            db.scalars(select(RetailOrderItem).where(RetailOrderItem.retail_order_id == order.id)).all()
        )
        results.append(_serialize_order(order, items))
    return results


@router.get("/admin/overview")
def admin_live_overview(
    admin: AuthenticatedPrincipal = Depends(require_admin_permission("payments.read")),
    db: Session = Depends(get_db),
) -> dict:
    """Strictly admin-only real database snapshot for the Admin Console."""
    users = list(db.scalars(select(User).order_by(User.created_at.desc()).limit(100)).all())
    sellers = list(db.scalars(select(SellerProfile).order_by(SellerProfile.created_at.desc()).limit(100)).all())
    listings = list(
        db.scalars(select(SellerProductListing).order_by(SellerProductListing.created_at.desc()).limit(100)).all()
    )
    orders = list(db.scalars(select(RetailOrder).order_by(RetailOrder.created_at.desc()).limit(100)).all())
    admin_creds = list(
        db.scalars(select(AdminCredential).order_by(AdminCredential.created_at.asc())).all()
    )

    return {
        "admin_user_id": admin.user_id,
        "admin_permissions": sorted(admin.admin_permissions),
        "counts": {
            "users": len(users),
            "sellers": len(sellers),
            "listings": len(listings),
            "orders": len(orders),
            "admins": len(admin_creds),
        },
        "admin_credentials": [
            {
                "id": ac.id,
                "user_id": ac.user_id,
                "email": ac.email,
                "password_hash": ac.password_hash,
                "is_active": ac.is_active,
                "last_login_at": ac.last_login_at.isoformat() if ac.last_login_at else None,
                "created_at": ac.created_at.isoformat(),
            }
            for ac in admin_creds
        ],
        "users": [
            {
                "id": u.id,
                "clerk_user_id": u.clerk_user_id,
                "email": u.email,
                "name": u.display_name or f"{u.first_name} {u.last_name or ''}".strip(),
                "phone": u.phone,
                "account_status": u.account_status,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "sellers": [
            {
                "id": s.id,
                "store_name": s.store_name,
                "store_slug": s.store_slug,
                "craft_specialty": s.craft_specialty,
                "workshop_district": s.workshop_district,
                "verification_path": s.verification_path,
                "verification_status": s.verification_status,
                "profile_status": s.profile_status,
                "claimed_gi_code": s.claimed_gi_authorized_user_no,
            }
            for s in sellers
        ],
        "listings": [
            {
                "id": l.id,
                "sku": l.seller_sku,
                "title": l.listing_title,
                "price": str(l.selling_price),
                "currency": l.currency_code,
                "status": l.listing_status,
            }
            for l in listings
        ],
        "orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "total_amount": str(o.total_amount),
                "payment_method": o.payment_method,
                "payment_status": o.payment_status,
                "fulfilment_status": o.fulfilment_status,
                "created_at": o.created_at.isoformat(),
            }
            for o in orders
        ],
    }
