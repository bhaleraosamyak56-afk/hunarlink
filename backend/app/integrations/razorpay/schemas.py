"""Exact Decimal rupees <-> integer paise conversion and Razorpay gateway DTOs."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, ConfigDict, Field


def rupees_to_paise(amount_rupees: Decimal) -> int:
    """Convert exact Decimal INR amount to integer paise without float math."""
    quantized = Decimal(amount_rupees).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    paise = int((quantized * Decimal("100")).to_integral_exact(rounding=ROUND_HALF_UP))
    if paise <= 0:
        raise ValueError("Payment amount in paise must be strictly positive.")
    return paise


def paise_to_rupees(amount_paise: int) -> Decimal:
    return (Decimal(amount_paise) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class RazorpayOrderDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    amount: int
    currency: str
    receipt: str | None = None
    status: str = "created"


class RazorpayPaymentDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    order_id: str | None = None
    amount: int
    currency: str
    status: str  # created | authorized | captured | refunded | failed
    method: str | None = None
    error_code: str | None = None
    error_description: str | None = None


class RazorpayRefundDTO(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    payment_id: str
    amount: int
    currency: str = Field(default="INR")
    status: str  # pending | processed | failed
