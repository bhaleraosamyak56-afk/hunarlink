"""Pydantic schemas for storefront catalog & server-authoritative retail order creation."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CatalogProductItem(BaseModel):
    listing_id: str
    product_id: str
    product_variant_id: str
    seller_profile_id: str
    seller_sku: str
    title: str
    category_slug: str
    category_name: str
    store_name: str
    selling_price: Decimal
    compare_at_mrp: Decimal | None = None
    currency_code: str
    min_order_qty: int
    max_order_qty: int | None = None
    gi_status: str


class RetailOrderLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seller_listing_id: str = Field(..., min_length=1, max_length=64)
    quantity: int = Field(..., ge=1, le=500)


class ShippingAddressInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=2, max_length=160)
    phone: str = Field(..., min_length=7, max_length=32)
    locality: str = Field(..., min_length=2, max_length=255)
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(default="Jammu and Kashmir", min_length=2, max_length=100)
    pincode: str = Field(..., min_length=4, max_length=20)


class CreateRetailOrderRequest(BaseModel):
    """Browser sends ONLY listing IDs, quantities, shipping address, and payment method.

    Notice: No price, discount, or total field is accepted from the browser;
    FastAPI computes every monetary figure from MySQL seller_product_listings.
    """

    model_config = ConfigDict(extra="forbid")

    items: list[RetailOrderLineInput] = Field(..., min_length=1, max_length=50)
    shipping_address: ShippingAddressInput
    payment_method: Literal["RAZORPAY_STANDARD", "COD"] = "RAZORPAY_STANDARD"


class RetailOrderSummaryResponse(BaseModel):
    order_id: str
    order_number: str
    order_scope: str = "RETAIL"
    payment_method: str
    payment_status: str
    fulfilment_status: str
    currency_code: str
    subtotal_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_fee: Decimal
    total_amount: Decimal
    item_count: int
    created_at: datetime
