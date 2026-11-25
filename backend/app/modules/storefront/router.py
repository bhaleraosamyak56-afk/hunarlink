"""FastAPI storefront router bridging React checkout/catalog with MySQL & Razorpay."""
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedPrincipal, get_current_principal
from app.core.database import get_db
from app.models.base import new_uuid, utcnow
from app.models.core_models import (
    Category,
    Product,
    ProductVariant,
    RetailOrder,
    RetailOrderItem,
    SellerFulfilmentGroup,
    SellerProductListing,
    SellerProfile,
)
from app.modules.storefront.schemas import (
    CatalogProductItem,
    CreateRetailOrderRequest,
    RetailOrderSummaryResponse,
)

router = APIRouter(tags=["Storefront & Retail Orders"])


@router.get("/catalog/products", response_model=list[CatalogProductItem])
def list_active_catalog_products(
    category_slug: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[CatalogProductItem]:
    """Return active, approved marketplace listings from the database."""
    safe_limit = max(1, min(limit, 200))
    stmt = (
        select(SellerProductListing, Product, Category, SellerProfile)
        .join(Product, Product.id == SellerProductListing.product_id)
        .join(Category, Category.id == Product.category_id)
        .join(SellerProfile, SellerProfile.id == SellerProductListing.seller_profile_id)
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
        CatalogProductItem(
            listing_id=listing.id,
            product_id=product.id,
            product_variant_id=listing.product_variant_id,
            seller_profile_id=seller.id,
            seller_sku=listing.seller_sku,
            title=listing.listing_title,
            category_slug=category.slug,
            category_name=category.name,
            store_name=seller.store_name,
            selling_price=listing.selling_price,
            compare_at_mrp=listing.compare_at_mrp,
            currency_code=listing.currency_code,
            min_order_qty=listing.min_order_qty,
            max_order_qty=listing.max_order_qty,
            gi_status=product.gi_status,
        )
        for listing, product, category, seller in rows
    ]


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
    total_qty = 0

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
        total_qty += req_item.quantity
        grouped_lines[seller.id].append((listing, product, variant, req_item.quantity, line_total))

    is_cod = payload.payment_method == "COD"
    order = RetailOrder(
        id=new_uuid(),
        order_number=f"HL-RET-{uuid.uuid4().hex[:8].upper()}",
        customer_user_id=principal.user_id,
        shipping_address_snapshot_json=payload.shipping_address.model_dump(mode="json"),
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
            db.add(
                RetailOrderItem(
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
            )

    db.commit()
    return RetailOrderSummaryResponse(
        order_id=order.id,
        order_number=order.order_number,
        order_scope="RETAIL",
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        fulfilment_status=order.fulfilment_status,
        currency_code=order.currency_code,
        subtotal_amount=order.subtotal_amount,
        discount_amount=order.discount_amount,
        tax_amount=order.tax_amount,
        shipping_fee=order.shipping_fee,
        total_amount=order.total_amount,
        item_count=total_qty,
        created_at=order.created_at,
    )


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
        results.append(
            RetailOrderSummaryResponse(
                order_id=order.id,
                order_number=order.order_number,
                order_scope="RETAIL",
                payment_method=order.payment_method,
                payment_status=order.payment_status,
                fulfilment_status=order.fulfilment_status,
                currency_code=order.currency_code,
                subtotal_amount=order.subtotal_amount,
                discount_amount=order.discount_amount,
                tax_amount=order.tax_amount,
                shipping_fee=order.shipping_fee,
                total_amount=order.total_amount,
                item_count=sum(i.quantity for i in items),
                created_at=order.created_at,
            )
        )
    return results
