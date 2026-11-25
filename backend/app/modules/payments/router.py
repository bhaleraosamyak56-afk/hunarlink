"""FastAPI routers for customer/wholesale Razorpay payments, refunds, and Admin operations."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.auth import (
    AuthenticatedPrincipal,
    get_current_principal,
    require_admin_permission,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import SlidingWindowRateLimiter
from app.integrations.razorpay.client import OfficialRazorpayClient, RazorpayGatewayProtocol
from app.modules.payments import repository, service
from app.modules.payments.schemas import (
    CreateRazorpayOrderRequest,
    CreateRazorpayOrderResponse,
    PaymentStatusResponse,
    RefundRequest,
    RefundResponse,
    VerifyRazorpayPaymentRequest,
    VerifyRazorpayPaymentResponse,
)

router = APIRouter(tags=["Payments (Razorpay)"])
payment_rate_limiter = SlidingWindowRateLimiter(max_requests=60, window_seconds=60)


def get_razorpay_gateway(settings: Settings = Depends(get_settings)) -> RazorpayGatewayProtocol:
    return OfficialRazorpayClient(settings)


def _corr_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", "missing-correlation-id")


def _enforce_rate_limit(request: Request, principal: AuthenticatedPrincipal) -> None:
    key = f"pay:{principal.user_id}:{request.client.host if request.client else 'unknown'}"
    allowed, retry_after = payment_rate_limiter.allow(key)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Payment endpoint rate limit exceeded; please retry shortly.",
            headers={"Retry-After": str(retry_after)},
        )


@router.post("/payments/razorpay/create-order", response_model=CreateRazorpayOrderResponse)
def create_order(
    payload: CreateRazorpayOrderRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    settings: Settings = Depends(get_settings),
    gateway: RazorpayGatewayProtocol = Depends(get_razorpay_gateway),
    db: Session = Depends(get_db),
) -> CreateRazorpayOrderResponse:
    _enforce_rate_limit(request, principal)
    return service.create_razorpay_order(
        db,
        principal=principal,
        payload=payload,
        settings=settings,
        gateway=gateway,
        correlation_id=_corr_id(request),
    )


@router.post("/payments/razorpay/verify", response_model=VerifyRazorpayPaymentResponse)
def verify_payment(
    payload: VerifyRazorpayPaymentRequest,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    settings: Settings = Depends(get_settings),
    gateway: RazorpayGatewayProtocol = Depends(get_razorpay_gateway),
    db: Session = Depends(get_db),
) -> VerifyRazorpayPaymentResponse:
    _enforce_rate_limit(request, principal)
    return service.verify_razorpay_checkout_payment(
        db,
        principal=principal,
        payload=payload,
        settings=settings,
        gateway=gateway,
    )


@router.get("/payments/{payment_id}", response_model=PaymentStatusResponse)
def get_payment(
    payment_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> PaymentStatusResponse:
    return service.get_payment_status_for_user(db, principal=principal, payment_id=payment_id)


@router.get("/orders/{order_scope}/{order_id}/payment-status", response_model=PaymentStatusResponse)
def get_order_payment_status(
    order_scope: str,
    order_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> PaymentStatusResponse:
    scope = order_scope.upper()
    purpose = service.SCOPE_TO_PURPOSE.get(scope)
    if not purpose:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid order_scope.")
    payment = repository.get_existing_order_payment(db, payment_purpose=purpose, order_id=order_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No payment found for this order.")
    return service.get_payment_status_for_user(db, principal=principal, payment_id=payment.id)


@router.post("/payments/{payment_id}/refund", response_model=RefundResponse)
def refund_payment(
    payment_id: str,
    payload: RefundRequest,
    request: Request,
    admin: AuthenticatedPrincipal = Depends(require_admin_permission("payments.refund")),
    gateway: RazorpayGatewayProtocol = Depends(get_razorpay_gateway),
    db: Session = Depends(get_db),
) -> RefundResponse:
    return service.initiate_refund(
        db,
        admin=admin,
        payment_id=payment_id,
        payload=payload,
        gateway=gateway,
        correlation_id=_corr_id(request),
        ip_address=request.client.host if request.client else None,
    )


# ---------------------------------------------------------------------------
# Admin Payments, Webhooks & Refunds Operations
# ---------------------------------------------------------------------------
@router.get("/admin/payments")
def admin_list_payments(
    order_scope: str | None = None,
    payment_status: str | None = None,
    _admin: AuthenticatedPrincipal = Depends(require_admin_permission("payments.read")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = repository.list_admin_payments(
        db, order_scope=order_scope, payment_status=payment_status
    )
    return [
        {
            "id": p.id,
            "payment_reference": p.payment_reference,
            "payment_purpose": p.payment_purpose,
            "retail_order_id": p.retail_order_id,
            "wholesale_order_id": p.wholesale_order_id,
            "payment_method": p.payment_method,
            "amount": str(p.amount),
            "captured_amount": str(p.captured_amount),
            "refunded_amount": str(repository.sum_active_and_processed_refunds(db, p.id)),
            "currency": p.currency_code,
            "payment_status": p.payment_status,
            "provider_order_id": p.provider_order_id,
            "provider_payment_id": p.provider_payment_id,
        }
        for p in rows
    ]


@router.get("/admin/payments/{payment_id}")
def admin_get_payment(
    payment_id: str,
    _admin: AuthenticatedPrincipal = Depends(require_admin_permission("payments.read")),
    db: Session = Depends(get_db),
) -> dict:
    p = repository.get_payment(db, payment_id)
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return {
        "id": p.id,
        "payment_reference": p.payment_reference,
        "payment_purpose": p.payment_purpose,
        "payment_method": p.payment_method,
        "amount": str(p.amount),
        "captured_amount": str(p.captured_amount),
        "refunded_amount": str(repository.sum_active_and_processed_refunds(db, p.id)),
        "currency": p.currency_code,
        "payment_status": p.payment_status,
        "provider_order_id": p.provider_order_id,
        "provider_payment_id": p.provider_payment_id,
    }


@router.get("/admin/payment-webhooks")
def admin_list_webhooks(
    _admin: AuthenticatedPrincipal = Depends(require_admin_permission("payments.read")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = repository.list_admin_webhook_events(db)
    return [
        {
            "id": w.id,
            "provider_event_id": w.provider_event_id,
            "event_type": w.event_type,
            "signature_verified": w.signature_verified,
            "processing_status": w.processing_status,
            "payment_id": w.payment_id,
        }
        for w in rows
    ]


@router.get("/admin/refunds")
def admin_list_refunds(
    _admin: AuthenticatedPrincipal = Depends(require_admin_permission("payments.read")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = repository.list_admin_refunds(db)
    return [
        {
            "id": r.id,
            "refund_reference": r.refund_reference,
            "payment_id": r.payment_id,
            "provider_refund_id": r.provider_refund_id,
            "refund_type": r.refund_type,
            "amount": str(r.amount),
            "currency": r.currency_code,
            "refund_status": r.refund_status,
            "reason": r.reason,
        }
        for r in rows
    ]
