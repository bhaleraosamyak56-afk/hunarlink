"""HunarLink Razorpay Payment Service aligned verbatim with MySQL 8.4 baseline tables.

Honest architectural guarantees:
  - Uses Razorpay Standard Checkout (India / INR). Does NOT claim escrow or Route
    split-settlement.
  - Recalculates order totals server-side from MySQL order items (`Decimal` -> integer paise).
  - Commits short pending-intent DB transaction BEFORE calling Razorpay external API.
  - Strictly separates Retail/Wholesale online Razorpay payments, COD orders,
    and Supplier-to-dealer procurement POs.
  - Fulfills ONLY on verified CAPTURED (never AUTHORIZED alone).
  - Protects CAPTURED/REFUNDED payments from delayed/out-of-order `payment.failed` webhooks.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit_log
from app.core.auth import AuthenticatedPrincipal
from app.core.config import Settings
from app.integrations.razorpay.client import RazorpayGatewayProtocol
from app.integrations.razorpay.exceptions import (
    RazorpayGatewayError,
    RazorpaySignatureError,
    RazorpayTimeoutError,
)
from app.integrations.razorpay.schemas import paise_to_rupees, rupees_to_paise
from app.integrations.razorpay.signatures import (
    verify_checkout_signature,
    verify_webhook_signature,
)
from app.models.base import new_uuid, utcnow
from app.models.core_models import (
    DealerProfile,
    DealerQuote,
    DealerWholesaleListing,
    Payment,
    PaymentAttempt,
    PaymentWebhookEvent,
    Refund,
    RetailOrder,
    RetailOrderItem,
    SellerFulfilmentGroup,
    SellerProductListing,
    SellerProfile,
    WholesaleOrder,
    WholesaleOrderItem,
    WholesaleRFQ,
)
from app.modules.payments import repository
from app.modules.payments.schemas import (
    CreateRazorpayOrderRequest,
    CreateRazorpayOrderResponse,
    PaymentStatusResponse,
    RefundRequest,
    RefundResponse,
    VerifyRazorpayPaymentRequest,
    VerifyRazorpayPaymentResponse,
    WebhookAckResponse,
)
from app.modules.payments.state_machine import (
    CAPTURED_OR_POST_CAPTURE,
    is_out_of_order_downgrade,
)

SCOPE_TO_PURPOSE = {
    "RETAIL": "RETAIL_ORDER",
    "WHOLESALE": "WHOLESALE_ORDER",
}
PURPOSE_TO_SCOPE = {v: k for k, v in SCOPE_TO_PURPOSE.items()}


def _as_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _validate_and_calculate_retail_order(
    db: Session,
    *,
    order_id: str,
    principal: AuthenticatedPrincipal,
) -> tuple[RetailOrder, Decimal]:
    order = db.scalar(select(RetailOrder).where(RetailOrder.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retail order not found.")
    if order.customer_user_id != principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot initiate payment for another user's retail order.",
        )
    if order.payment_method == "COD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cash-on-Delivery (COD) orders cannot create an online Razorpay payment order.",
        )
    if order.currency_code.upper() != "INR":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported currency '{order.currency_code}'. Razorpay checkout supports INR only.",
        )
    if order.fulfilment_status in {"CANCELLED", "REFUNDED"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot pay for a retail order in '{order.fulfilment_status}' status.",
        )

    items = list(
        db.scalars(select(RetailOrderItem).where(RetailOrderItem.retail_order_id == order.id)).all()
    )
    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Retail order has no line items.",
        )

    subtotal = Decimal("0.00")
    for item in items:
        group = db.scalar(
            select(SellerFulfilmentGroup).where(
                SellerFulfilmentGroup.id == item.seller_fulfilment_group_id
            )
        )
        seller = (
            db.scalar(select(SellerProfile).where(SellerProfile.id == group.seller_profile_id))
            if group is not None
            else None
        )
        if seller is None or seller.profile_status != "ACTIVE" or seller.verification_status != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="One or more sellers on this retail order are not active and verified.",
            )
        listing = db.scalar(
            select(SellerProductListing).where(SellerProductListing.id == item.seller_listing_id)
        )
        if listing is None or listing.listing_status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="One or more product listings on this order are no longer active.",
            )
        subtotal += (Decimal(item.unit_price_snapshot) * Decimal(item.quantity)).quantize(Decimal("0.01"))

    authoritative_total = (
        subtotal - Decimal(order.discount_amount) + Decimal(order.tax_amount) + Decimal(order.shipping_fee)
    ).quantize(Decimal("0.01"))
    if authoritative_total <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calculated payable order total must be positive.",
        )

    order.subtotal_amount = subtotal
    order.total_amount = authoritative_total
    return order, authoritative_total


def _validate_and_calculate_wholesale_order(
    db: Session,
    *,
    order_id: str,
    principal: AuthenticatedPrincipal,
) -> tuple[WholesaleOrder, Decimal]:
    order = db.scalar(select(WholesaleOrder).where(WholesaleOrder.id == order_id))
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wholesale order not found.")
    if order.buyer_user_id != principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot initiate payment for another buyer's wholesale order.",
        )
    if order.payment_method == "COD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="COD wholesale orders cannot create an online Razorpay checkout order.",
        )
    if order.currency_code.upper() != "INR":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported currency '{order.currency_code}'. Razorpay checkout supports INR only.",
        )

    dealer = db.scalar(select(DealerProfile).where(DealerProfile.id == order.dealer_profile_id))
    if dealer is None or dealer.profile_status != "ACTIVE" or dealer.verification_status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dealer profile on this wholesale order is not active and verified.",
        )

    if order.order_source == "ACCEPTED_RFQ_QUOTE":
        if not order.dealer_quote_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="ACCEPTED_RFQ_QUOTE wholesale order is missing dealer_quote_id.",
            )
        quote = db.scalar(select(DealerQuote).where(DealerQuote.id == order.dealer_quote_id))
        if quote is None or quote.quote_status != "ACCEPTED" or quote.dealer_profile_id != dealer.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Referenced dealer RFQ quote is not ACCEPTED for this dealer.",
            )
        rfq = db.scalar(select(WholesaleRFQ).where(WholesaleRFQ.id == quote.wholesale_rfq_id))
        if rfq is None or rfq.buyer_user_id != principal.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Referenced RFQ quote does not belong to this buyer.",
            )
        if _as_utc(quote.valid_until) <= _as_utc(utcnow()):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Accepted RFQ quote has expired and cannot be paid.",
            )

    items = list(
        db.scalars(select(WholesaleOrderItem).where(WholesaleOrderItem.wholesale_order_id == order.id)).all()
    )
    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wholesale order has no line items.",
        )

    subtotal = Decimal("0.00")
    for item in items:
        if item.dealer_wholesale_listing_id:
            listing = db.scalar(
                select(DealerWholesaleListing).where(
                    DealerWholesaleListing.id == item.dealer_wholesale_listing_id
                )
            )
            if listing is None or listing.listing_status != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Wholesale listing on this order is no longer active.",
                )
        subtotal += (Decimal(item.unit_price_snapshot) * Decimal(item.quantity)).quantize(Decimal("0.01"))

    authoritative_total = (
        subtotal - Decimal(order.discount_amount) + Decimal(order.tax_amount) + Decimal(order.shipping_fee)
    ).quantize(Decimal("0.01"))
    if authoritative_total <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calculated wholesale order total must be positive.",
        )

    order.subtotal_amount = subtotal
    order.total_amount = authoritative_total
    return order, authoritative_total


def create_razorpay_order(
    db: Session,
    *,
    principal: AuthenticatedPrincipal,
    payload: CreateRazorpayOrderRequest,
    settings: Settings,
    gateway: RazorpayGatewayProtocol,
    correlation_id: str,
) -> CreateRazorpayOrderResponse:
    # 1. Block supplier-to-dealer procurement POs from customer Razorpay Checkout!
    if payload.order_scope == "SUPPLIER_PROCUREMENT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier-to-dealer procurement obligations use separate procurement payment records, not customer Razorpay checkout.",
        )

    payment_purpose = SCOPE_TO_PURPOSE[payload.order_scope]

    # 2. Idempotency check by idempotency_key
    existing_by_key = repository.get_payment_by_idempotency(db, payload.idempotency_key)
    if existing_by_key is not None:
        if existing_by_key.payer_user_id != principal.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Idempotency key belongs to another payer.",
            )
        if existing_by_key.provider_order_id:
            order = repository.get_order_for_payment(db, existing_by_key)
            return CreateRazorpayOrderResponse(
                payment_id=existing_by_key.id,
                order_scope=PURPOSE_TO_SCOPE.get(existing_by_key.payment_purpose, payload.order_scope),
                order_id=existing_by_key.retail_order_id or existing_by_key.wholesale_order_id or "",
                order_number=order.order_number if order else existing_by_key.payment_reference,
                razorpay_key_id=settings.razorpay_key_id,
                razorpay_order_id=existing_by_key.provider_order_id,
                amount_paise=rupees_to_paise(existing_by_key.amount),
                amount_rupees=existing_by_key.amount,
                currency=existing_by_key.currency_code,
                payment_status=existing_by_key.payment_status,
                idempotent_replay=True,
            )

    # 3. Validate order ownership, business eligibility, and compute authoritative total
    if payload.order_scope == "RETAIL":
        order_obj, authoritative_total = _validate_and_calculate_retail_order(
            db, order_id=payload.order_id, principal=principal
        )
    else:
        order_obj, authoritative_total = _validate_and_calculate_wholesale_order(
            db, order_id=payload.order_id, principal=principal
        )

    # 4. Prevent duplicate Razorpay orders for the same HunarLink order
    existing_order_payment = repository.get_existing_order_payment(
        db, payment_purpose=payment_purpose, order_id=order_obj.id
    )
    if existing_order_payment is not None:
        if existing_order_payment.payment_status in CAPTURED_OR_POST_CAPTURE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This order has already been paid and captured.",
            )
        if existing_order_payment.payment_status == "RECONCILIATION_REQUIRED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A previous payment attempt timed out and requires reconciliation before creating another order.",
            )
        if existing_order_payment.provider_order_id:
            return CreateRazorpayOrderResponse(
                payment_id=existing_order_payment.id,
                order_scope=payload.order_scope,
                order_id=order_obj.id,
                order_number=order_obj.order_number,
                razorpay_key_id=settings.razorpay_key_id,
                razorpay_order_id=existing_order_payment.provider_order_id,
                amount_paise=rupees_to_paise(existing_order_payment.amount),
                amount_rupees=existing_order_payment.amount,
                currency=existing_order_payment.currency_code,
                payment_status=existing_order_payment.payment_status,
                idempotent_replay=True,
            )

    amount_paise = rupees_to_paise(authoritative_total)

    # 5. SHORT TRANSACTION #1: Persist pending payment & attempt BEFORE calling Razorpay
    payment = Payment(
        id=new_uuid(),
        payment_reference=f"PAY-{uuid.uuid4().hex[:10].upper()}",
        payment_purpose=payment_purpose,
        retail_order_id=order_obj.id if payload.order_scope == "RETAIL" else None,
        wholesale_order_id=order_obj.id if payload.order_scope == "WHOLESALE" else None,
        payer_user_id=principal.user_id,
        payment_method="RAZORPAY_STANDARD",
        provider_name="RAZORPAY",
        amount=authoritative_total,
        captured_amount=Decimal("0.00"),
        currency_code="INR",
        payment_status="INITIATED",
        idempotency_key=payload.idempotency_key,
        provider_receipt=order_obj.order_number[:40],
    )
    attempt = PaymentAttempt(
        id=new_uuid(),
        payment_id=payment.id,
        payer_user_id=principal.user_id,
        attempt_number=1,
        amount=authoritative_total,
        currency_code="INR",
        attempt_status="INITIATED",
        idempotency_key=payload.idempotency_key,
    )
    db.add(payment)
    db.add(attempt)
    repository.append_payment_status_history(
        db,
        payment=payment,
        from_status=None,
        to_status="INITIATED",
        event_source="API",
        actor_user_id=principal.user_id,
        notes="Server-side Razorpay order intent recorded",
    )
    db.commit()  # Release DB lock BEFORE external Razorpay network I/O!

    # 6. Call Razorpay server-side
    try:
        rzp_order = gateway.create_order(
            amount_paise=amount_paise,
            currency="INR",
            receipt=order_obj.order_number,
            notes={
                "hunarlink_payment_id": payment.id,
                "order_scope": payload.order_scope,
                "order_id": order_obj.id,
                "correlation_id": correlation_id,
            },
        )
    except RazorpayTimeoutError as exc:
        payment.payment_status = "RECONCILIATION_REQUIRED"
        payment.failure_code = "GATEWAY_TIMEOUT"
        payment.failure_reason = str(exc)
        attempt.attempt_status = "RECONCILIATION_REQUIRED"
        attempt.failure_code = "GATEWAY_TIMEOUT"
        attempt.failure_description = str(exc)
        repository.append_payment_status_history(
            db,
            payment=payment,
            from_status="INITIATED",
            to_status="RECONCILIATION_REQUIRED",
            event_source="API",
            actor_user_id=principal.user_id,
            notes="Razorpay create_order timed out; reconciliation required",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Payment gateway timed out; attempt marked RECONCILIATION_REQUIRED.",
        ) from exc
    except RazorpayGatewayError as exc:
        payment.payment_status = "FAILED"
        payment.failed_at = utcnow()
        payment.failure_code = exc.code
        payment.failure_reason = str(exc)
        attempt.attempt_status = "FAILED"
        attempt.failure_code = exc.code
        attempt.failure_description = str(exc)
        repository.append_payment_status_history(
            db,
            payment=payment,
            from_status="INITIATED",
            to_status="FAILED",
            event_source="API",
            actor_user_id=principal.user_id,
            notes="Razorpay explicitly rejected create_order",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Razorpay rejected order creation.",
        ) from exc

    # 7. SHORT TRANSACTION #2: Save provider_order_id & transition to ORDER_CREATED
    payment.provider_order_id = rzp_order.id
    payment.payment_status = "ORDER_CREATED"
    attempt.provider_order_id = rzp_order.id
    attempt.attempt_status = "ORDER_CREATED"
    order_obj.payment_status = "ORDER_CREATED"
    repository.append_payment_status_history(
        db,
        payment=payment,
        from_status="INITIATED",
        to_status="ORDER_CREATED",
        event_source="API",
        actor_user_id=principal.user_id,
        provider_event_ref=rzp_order.id,
        notes=f"Razorpay order created: {rzp_order.id}",
    )
    db.commit()

    return CreateRazorpayOrderResponse(
        payment_id=payment.id,
        order_scope=payload.order_scope,
        order_id=order_obj.id,
        order_number=order_obj.order_number,
        razorpay_key_id=settings.razorpay_key_id,
        razorpay_order_id=rzp_order.id,
        amount_paise=amount_paise,
        amount_rupees=authoritative_total,
        currency="INR",
        payment_status=payment.payment_status,
        idempotent_replay=False,
    )


def _apply_verified_capture(
    db: Session,
    *,
    payment: Payment,
    order_obj: RetailOrder | WholesaleOrder,
    provider_payment_id: str,
    captured_amount_rupees: Decimal,
    event_source: str,
    actor_user_id: str | None = None,
) -> None:
    prev_status = payment.payment_status
    payment.provider_payment_id = provider_payment_id
    payment.captured_amount = captured_amount_rupees
    payment.captured_at = payment.captured_at or utcnow()
    payment.payment_status = "CAPTURED"

    order_obj.payment_status = "CAPTURED"
    if order_obj.fulfilment_status == "PENDING_PAYMENT":
        order_obj.fulfilment_status = "CONFIRMED"
        order_obj.confirmed_at = utcnow()

    latest_attempt = repository.get_latest_attempt(db, payment.id)
    if latest_attempt is not None:
        latest_attempt.provider_payment_id = provider_payment_id
        latest_attempt.attempt_status = "CAPTURED"

    if prev_status != "CAPTURED":
        repository.append_payment_status_history(
            db,
            payment=payment,
            from_status=prev_status,
            to_status="CAPTURED",
            event_source=event_source,
            actor_user_id=actor_user_id,
            provider_event_ref=provider_payment_id,
            notes=f"Verified payment capture {provider_payment_id}",
        )


def verify_razorpay_checkout_payment(
    db: Session,
    *,
    principal: AuthenticatedPrincipal,
    payload: VerifyRazorpayPaymentRequest,
    settings: Settings,
    gateway: RazorpayGatewayProtocol,
) -> VerifyRazorpayPaymentResponse:
    payment = repository.get_payment(db, payload.payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment record not found.")
    if payment.payer_user_id != principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot verify another user's payment.",
        )
    if not payment.provider_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not have a stored Razorpay order_id.",
        )

    order_obj = repository.get_order_for_payment(db, payment)
    if order_obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked order not found.")

    order_scope = PURPOSE_TO_SCOPE.get(payment.payment_purpose, payment.payment_purpose)

    if payment.payment_status in CAPTURED_OR_POST_CAPTURE:
        if payment.provider_payment_id == payload.razorpay_payment_id:
            return VerifyRazorpayPaymentResponse(
                payment_id=payment.id,
                order_scope=order_scope,
                order_id=order_obj.id,
                payment_status=payment.payment_status,
                fulfilment_status=order_obj.fulfilment_status,
                razorpay_order_id=payment.provider_order_id,
                razorpay_payment_id=payment.provider_payment_id,
                captured_amount=payment.captured_amount,
                currency=payment.currency_code,
                idempotent_replay=True,
            )

    if payload.razorpay_order_id and payload.razorpay_order_id != payment.provider_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submitted razorpay_order_id does not match stored HunarLink order.",
        )

    try:
        verify_checkout_signature(
            stored_razorpay_order_id=payment.provider_order_id,
            razorpay_payment_id=payload.razorpay_payment_id,
            provided_signature=payload.razorpay_signature,
            key_secret=settings.razorpay_key_secret.get_secret_value(),
        )
    except RazorpaySignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Razorpay payment signature.",
        ) from exc

    rzp_payment = gateway.fetch_payment(razorpay_payment_id=payload.razorpay_payment_id)

    expected_paise = rupees_to_paise(payment.amount)
    if rzp_payment.amount != expected_paise:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Razorpay payment amount ({rzp_payment.amount} paise) does not match expected order amount ({expected_paise} paise).",
        )
    if rzp_payment.currency.upper() != payment.currency_code.upper():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Razorpay payment currency '{rzp_payment.currency}' does not match expected '{payment.currency_code}'.",
        )
    if rzp_payment.order_id and rzp_payment.order_id != payment.provider_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Razorpay payment does not belong to the stored Razorpay order.",
        )

    rzp_status = rzp_payment.status.lower()
    if rzp_status == "captured":
        _apply_verified_capture(
            db,
            payment=payment,
            order_obj=order_obj,
            provider_payment_id=rzp_payment.id,
            captured_amount_rupees=paise_to_rupees(rzp_payment.amount),
            event_source="VERIFY_CALLBACK",
            actor_user_id=principal.user_id,
        )
    elif rzp_status == "authorized":
        prev = payment.payment_status
        payment.provider_payment_id = rzp_payment.id
        payment.authorized_at = payment.authorized_at or utcnow()
        payment.payment_status = "AUTHORIZED"
        order_obj.payment_status = "AUTHORIZED"
        latest_attempt = repository.get_latest_attempt(db, payment.id)
        if latest_attempt is not None:
            latest_attempt.provider_payment_id = rzp_payment.id
            latest_attempt.attempt_status = "AUTHORIZED"
        if prev != "AUTHORIZED":
            repository.append_payment_status_history(
                db,
                payment=payment,
                from_status=prev,
                to_status="AUTHORIZED",
                event_source="VERIFY_CALLBACK",
                actor_user_id=principal.user_id,
                provider_event_ref=rzp_payment.id,
                notes="Payment authorized by gateway; awaiting capture before fulfilment.",
            )
    elif rzp_status == "failed":
        if not is_out_of_order_downgrade(payment.payment_status, "FAILED"):
            prev = payment.payment_status
            payment.payment_status = "FAILED"
            payment.failed_at = utcnow()
            order_obj.payment_status = "FAILED"
            repository.append_payment_status_history(
                db,
                payment=payment,
                from_status=prev,
                to_status="FAILED",
                event_source="VERIFY_CALLBACK",
                actor_user_id=principal.user_id,
                notes=rzp_payment.error_description or "Payment failed at gateway.",
            )
    else:
        payment.payment_status = "PENDING_VERIFICATION"

    db.commit()
    return VerifyRazorpayPaymentResponse(
        payment_id=payment.id,
        order_scope=order_scope,
        order_id=order_obj.id,
        payment_status=payment.payment_status,
        fulfilment_status=order_obj.fulfilment_status,
        razorpay_order_id=payment.provider_order_id,
        razorpay_payment_id=rzp_payment.id,
        captured_amount=payment.captured_amount,
        currency=payment.currency_code,
        idempotent_replay=False,
    )


def handle_razorpay_webhook(
    db: Session,
    *,
    raw_body: bytes,
    signature_header: str | None,
    event_id_header: str | None,
    settings: Settings,
) -> WebhookAckResponse:
    try:
        verify_webhook_signature(
            raw_body=raw_body,
            provided_signature=signature_header,
            webhook_secret=settings.razorpay_webhook_secret.get_secret_value(),
        )
    except RazorpaySignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Razorpay webhook signature.",
        ) from exc

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed webhook JSON payload.",
        ) from exc

    event_type = str(body.get("event") or "unknown")
    payload_sha256 = hashlib.sha256(raw_body).hexdigest()
    event_id = (event_id_header or "").strip() or f"sha256:{payload_sha256}"

    existing_event = repository.get_webhook_event_by_provider_id(db, event_id)
    if existing_event is not None:
        return WebhookAckResponse(
            received=True,
            event_id=event_id,
            event_type=event_type,
            processing_status="DUPLICATE_IGNORED",
        )

    payload_section = body.get("payload") or {}
    payment_entity = (payload_section.get("payment") or {}).get("entity") or {}
    order_entity = (payload_section.get("order") or {}).get("entity") or {}
    refund_entity = (payload_section.get("refund") or {}).get("entity") or {}

    rzp_order_id = payment_entity.get("order_id") or order_entity.get("id")
    rzp_payment_id = payment_entity.get("id") or refund_entity.get("payment_id")

    # Store only safe redacted summary (never raw card/PII fields)
    safe_summary = {
        "event": event_type,
        "payload_sha256": payload_sha256,
        "provider_order_id": rzp_order_id,
        "provider_payment_id": rzp_payment_id,
        "amount": payment_entity.get("amount") or order_entity.get("amount_paid") or refund_entity.get("amount"),
        "currency": payment_entity.get("currency") or order_entity.get("currency"),
        "status": payment_entity.get("status") or refund_entity.get("status"),
    }

    webhook_row = PaymentWebhookEvent(
        id=new_uuid(),
        provider_name="RAZORPAY",
        provider_event_id=event_id,
        event_type=event_type,
        provider_order_id=str(rzp_order_id) if rzp_order_id else None,
        provider_payment_id=str(rzp_payment_id) if rzp_payment_id else None,
        signature_verified=True,
        processing_status="RECEIVED",
        safe_payload_summary_json=safe_summary,
    )
    db.add(webhook_row)
    db.flush()

    payment = None
    if rzp_order_id:
        payment = repository.get_payment_by_provider_order(db, str(rzp_order_id))
    if payment is None and rzp_payment_id:
        payment = repository.get_payment_by_provider_payment(db, str(rzp_payment_id))

    if payment is None:
        webhook_row.processing_status = "IGNORED_UNMATCHED"
        webhook_row.processed_at = utcnow()
        db.commit()
        return WebhookAckResponse(
            received=True,
            event_id=event_id,
            event_type=event_type,
            processing_status=webhook_row.processing_status,
        )

    webhook_row.payment_id = payment.id
    order_obj = repository.get_order_for_payment(db, payment)

    if event_type in ("payment.captured", "order.paid"):
        amount_paise = payment_entity.get("amount") or order_entity.get("amount_paid") or rupees_to_paise(payment.amount)
        currency = str(payment_entity.get("currency") or order_entity.get("currency") or "INR").upper()
        expected_paise = rupees_to_paise(payment.amount)

        if int(amount_paise) != expected_paise or currency != payment.currency_code.upper():
            webhook_row.processing_status = "FAILED_AMOUNT_OR_CURRENCY_MISMATCH"
            webhook_row.error_summary = f"Expected {expected_paise} {payment.currency_code}, got {amount_paise} {currency}"
            payment.payment_status = "RECONCILIATION_REQUIRED"
        elif order_obj is not None:
            _apply_verified_capture(
                db,
                payment=payment,
                order_obj=order_obj,
                provider_payment_id=str(rzp_payment_id or payment.provider_payment_id or ""),
                captured_amount_rupees=paise_to_rupees(int(amount_paise)),
                event_source="WEBHOOK",
            )
            webhook_row.processing_status = "PROCESSED"

    elif event_type == "payment.failed":
        if is_out_of_order_downgrade(payment.payment_status, "FAILED"):
            webhook_row.processing_status = "IGNORED_OUT_OF_ORDER"
        else:
            prev = payment.payment_status
            payment.payment_status = "FAILED"
            payment.failed_at = utcnow()
            if order_obj is not None:
                order_obj.payment_status = "FAILED"
            latest_attempt = repository.get_latest_attempt(db, payment.id)
            if latest_attempt is not None:
                latest_attempt.attempt_status = "FAILED"
                latest_attempt.failure_code = payment_entity.get("error_code")
                latest_attempt.failure_description = payment_entity.get("error_description")
            repository.append_payment_status_history(
                db,
                payment=payment,
                from_status=prev,
                to_status="FAILED",
                event_source="WEBHOOK",
                provider_event_ref=event_id,
                notes=payment_entity.get("error_description") or "Webhook payment.failed",
            )
            webhook_row.processing_status = "PROCESSED"

    elif event_type in ("refund.processed", "refund.created"):
        provider_refund_id = refund_entity.get("id")
        refund_amount_paise = refund_entity.get("amount")
        existing_refund = None
        if provider_refund_id:
            existing_refund = db.scalar(
                select(Refund).where(Refund.provider_refund_id == str(provider_refund_id))
            )
        if existing_refund is not None:
            existing_refund.refund_status = "PROCESSED" if event_type == "refund.processed" else "PROCESSING"
            if event_type == "refund.processed":
                existing_refund.processed_at = utcnow()
        elif provider_refund_id and refund_amount_paise:
            amt = paise_to_rupees(int(refund_amount_paise))
            db.add(
                Refund(
                    id=new_uuid(),
                    refund_reference=f"RFD-{uuid.uuid4().hex[:10].upper()}",
                    payment_id=payment.id,
                    provider_refund_id=str(provider_refund_id),
                    refund_type="FULL" if amt >= payment.captured_amount else "PARTIAL",
                    amount=amt,
                    currency_code=payment.currency_code,
                    refund_status="PROCESSED" if event_type == "refund.processed" else "PROCESSING",
                    reason="Synced from Razorpay refund webhook",
                    initiated_by_user_id=payment.payer_user_id,
                    idempotency_key=f"webhook:{event_id}",
                    processed_at=utcnow() if event_type == "refund.processed" else None,
                )
            )
            db.flush()

        total_refunded = repository.sum_active_and_processed_refunds(db, payment.id)
        if total_refunded >= payment.captured_amount and payment.captured_amount > Decimal("0.00"):
            payment.payment_status = "REFUNDED"
            if order_obj is not None:
                order_obj.payment_status = "REFUNDED"
        elif total_refunded > Decimal("0.00"):
            payment.payment_status = "PARTIALLY_REFUNDED"
            if order_obj is not None:
                order_obj.payment_status = "PARTIALLY_REFUNDED"
        webhook_row.processing_status = "PROCESSED"

    else:
        webhook_row.processing_status = "IGNORED_UNHANDLED_EVENT"

    webhook_row.processed_at = utcnow()
    db.commit()

    return WebhookAckResponse(
        received=True,
        event_id=event_id,
        event_type=event_type,
        processing_status=webhook_row.processing_status,
    )


def initiate_refund(
    db: Session,
    *,
    admin: AuthenticatedPrincipal,
    payment_id: str,
    payload: RefundRequest,
    gateway: RazorpayGatewayProtocol,
    correlation_id: str,
    ip_address: str | None = None,
) -> RefundResponse:
    existing_refund = repository.get_refund_by_idempotency(db, payload.idempotency_key)
    if existing_refund is not None:
        payment = repository.get_payment(db, existing_refund.payment_id)
        return RefundResponse(
            refund_id=existing_refund.id,
            refund_number=existing_refund.refund_reference,
            payment_id=existing_refund.payment_id,
            provider_refund_id=existing_refund.provider_refund_id,
            refund_type=existing_refund.refund_type,
            amount=existing_refund.amount,
            currency=existing_refund.currency_code,
            refund_status=existing_refund.refund_status,
            payment_status=payment.payment_status if payment else "UNKNOWN",
            idempotent_replay=True,
        )

    payment = repository.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    if payment.payment_status not in ("CAPTURED", "PARTIALLY_REFUNDED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot refund a payment in status '{payment.payment_status}'.",
        )
    if not payment.provider_payment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment lacks provider_payment_id; cannot call Razorpay refund API.",
        )

    already_refunded = repository.sum_active_and_processed_refunds(db, payment.id)
    remaining_refundable = (payment.captured_amount - already_refunded).quantize(Decimal("0.01"))
    if remaining_refundable <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment is already fully refunded.",
        )

    if payload.refund_type == "FULL":
        refund_amount = remaining_refundable
    else:
        if payload.amount is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Partial refund requires an explicit positive 'amount'.",
            )
        refund_amount = payload.amount.quantize(Decimal("0.01"))

    if refund_amount > remaining_refundable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Refund amount ({refund_amount}) exceeds remaining refundable captured balance "
                f"({remaining_refundable}). Over-refund blocked."
            ),
        )

    # SHORT TRANSACTION #1: record INITIATED refund BEFORE external API call
    refund_row = Refund(
        id=new_uuid(),
        refund_reference=f"RFD-{uuid.uuid4().hex[:10].upper()}",
        payment_id=payment.id,
        refund_type=payload.refund_type,
        amount=refund_amount,
        currency_code=payment.currency_code,
        refund_status="INITIATED",
        reason=payload.reason,
        initiated_by_user_id=admin.user_id,
        approved_by_user_id=admin.user_id,
        idempotency_key=payload.idempotency_key,
    )
    db.add(refund_row)
    db.commit()

    try:
        rzp_refund = gateway.create_refund(
            razorpay_payment_id=payment.provider_payment_id,
            amount_paise=rupees_to_paise(refund_amount),
            notes={
                "hunarlink_refund_id": refund_row.id,
                "reason": payload.reason[:200],
                "correlation_id": correlation_id,
            },
        )
    except (RazorpayTimeoutError, RazorpayGatewayError) as exc:
        refund_row.refund_status = "FAILED"
        refund_row.failure_reason = str(exc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Razorpay refund request failed: {exc}",
        ) from exc

    # SHORT TRANSACTION #2: reconcile processed refund & immutable audit log
    prev_payment_status = payment.payment_status
    refund_row.provider_refund_id = rzp_refund.id
    refund_row.refund_status = "PROCESSED" if rzp_refund.status.lower() == "processed" else "PROCESSING"
    if refund_row.refund_status == "PROCESSED":
        refund_row.processed_at = utcnow()

    new_total_refunded = (already_refunded + refund_amount).quantize(Decimal("0.01"))
    if new_total_refunded >= payment.captured_amount:
        payment.payment_status = "REFUNDED"
    else:
        payment.payment_status = "PARTIALLY_REFUNDED"

    order_obj = repository.get_order_for_payment(db, payment)
    if order_obj is not None:
        order_obj.payment_status = payment.payment_status

    repository.append_payment_status_history(
        db,
        payment=payment,
        from_status=prev_payment_status,
        to_status=payment.payment_status,
        event_source="ADMIN_REFUND",
        actor_user_id=admin.user_id,
        provider_event_ref=rzp_refund.id,
        notes=payload.reason,
    )
    record_audit_log(
        db,
        actor_user_id=admin.user_id,
        actor_role="ADMIN",
        action=f"PAYMENT_REFUND_{payload.refund_type}",
        target_type="refunds",
        target_id=refund_row.id,
        reason=payload.reason,
        previous_values={"payment_status": prev_payment_status, "refunded_amount": str(already_refunded)},
        new_values={"payment_status": payment.payment_status, "refunded_amount": str(new_total_refunded)},
        correlation_id=correlation_id,
        ip_address=ip_address,
    )
    db.commit()

    return RefundResponse(
        refund_id=refund_row.id,
        refund_number=refund_row.refund_reference,
        payment_id=payment.id,
        provider_refund_id=refund_row.provider_refund_id,
        refund_type=refund_row.refund_type,
        amount=refund_row.amount,
        currency=refund_row.currency_code,
        refund_status=refund_row.refund_status,
        payment_status=payment.payment_status,
        idempotent_replay=False,
    )


def get_payment_status_for_user(
    db: Session,
    *,
    principal: AuthenticatedPrincipal,
    payment_id: str,
) -> PaymentStatusResponse:
    payment = repository.get_payment(db, payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")

    is_admin = principal.has_permission("payments.read")
    if not is_admin and payment.payer_user_id != principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot read another user's payment status.",
        )
    order_obj = repository.get_order_for_payment(db, payment)
    refunded_amount = repository.sum_active_and_processed_refunds(db, payment.id)
    return PaymentStatusResponse(
        payment_id=payment.id,
        payment_number=payment.payment_reference,
        order_scope=PURPOSE_TO_SCOPE.get(payment.payment_purpose, payment.payment_purpose),
        order_id=payment.retail_order_id or payment.wholesale_order_id or "",
        payment_method=payment.payment_method,
        payment_status=payment.payment_status,
        fulfilment_status=order_obj.fulfilment_status if order_obj else "UNKNOWN",
        amount=payment.amount,
        captured_amount=payment.captured_amount,
        refunded_amount=refunded_amount,
        currency=payment.currency_code,
        provider_order_id=payment.provider_order_id,
        provider_payment_id=payment.provider_payment_id,
        created_at=payment.created_at,
    )
