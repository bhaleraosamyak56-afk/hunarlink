"""Pydantic schemas for Razorpay Standard Checkout, verification, webhooks, and refunds.

Notice:
  - CreateOrderRequest explicitly ignores any client-submitted `amount` or `total` fields:
    totals are ALWAYS recalculated server-side from MySQL order items using Decimal.
  - CreateOrderResponse exposes ONLY safe public Razorpay fields (`razorpay_key_id`,
    `razorpay_order_id`, `amount_paise`, `currency`, etc.) — NEVER any secret!
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CreateRazorpayOrderRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    order_scope: Literal["RETAIL", "WHOLESALE", "SUPPLIER_PROCUREMENT"]
    order_id: str = Field(..., min_length=1, max_length=64)
    idempotency_key: str = Field(..., min_length=4, max_length=120)


class CreateRazorpayOrderResponse(BaseModel):
    payment_id: str
    order_scope: str
    order_id: str
    order_number: str
    razorpay_key_id: str
    razorpay_order_id: str
    amount_paise: int
    amount_rupees: Decimal
    currency: str
    payment_status: str
    idempotent_replay: bool = False
    mode_notice: str = "Standard Checkout (not escrow; not Route split settlement)"


class VerifyRazorpayPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payment_id: str = Field(..., min_length=1, max_length=64)
    razorpay_order_id: str | None = Field(default=None, max_length=120)
    razorpay_payment_id: str = Field(..., min_length=4, max_length=120)
    razorpay_signature: str = Field(..., min_length=10, max_length=256)


class VerifyRazorpayPaymentResponse(BaseModel):
    payment_id: str
    order_scope: str
    order_id: str
    payment_status: str
    fulfilment_status: str
    razorpay_order_id: str
    razorpay_payment_id: str
    captured_amount: Decimal
    currency: str
    idempotent_replay: bool = False


class PaymentStatusResponse(BaseModel):
    payment_id: str
    payment_number: str
    order_scope: str
    order_id: str
    payment_method: str
    payment_status: str
    fulfilment_status: str
    amount: Decimal
    captured_amount: Decimal
    refunded_amount: Decimal
    currency: str
    provider_order_id: str | None = None
    provider_payment_id: str | None = None
    created_at: datetime


class RefundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refund_type: Literal["FULL", "PARTIAL"] = "FULL"
    amount: Decimal | None = Field(default=None, gt=0)
    reason: str = Field(..., min_length=5, max_length=500)
    idempotency_key: str = Field(..., min_length=4, max_length=120)


class RefundResponse(BaseModel):
    refund_id: str
    refund_number: str
    payment_id: str
    provider_refund_id: str | None
    refund_type: str
    amount: Decimal
    currency: str
    refund_status: str
    payment_status: str
    idempotent_replay: bool = False


class WebhookAckResponse(BaseModel):
    received: bool = True
    event_id: str
    event_type: str
    processing_status: str
