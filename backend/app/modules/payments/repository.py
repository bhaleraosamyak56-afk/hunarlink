"""Data access repository aligned verbatim with HunarLink MySQL 8.4 payment tables."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.base import new_uuid
from app.models.core_models import (
    Payment,
    PaymentAttempt,
    PaymentStatusHistory,
    PaymentWebhookEvent,
    Refund,
    RetailOrder,
    WholesaleOrder,
)


def get_payment(db: Session, payment_id: str) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.id == payment_id))


def get_payment_by_idempotency(db: Session, idempotency_key: str) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.idempotency_key == idempotency_key))


def get_payment_by_provider_order(db: Session, provider_order_id: str) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.provider_order_id == provider_order_id))


def get_payment_by_provider_payment(db: Session, provider_payment_id: str) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.provider_payment_id == provider_payment_id))


def get_existing_order_payment(
    db: Session,
    *,
    payment_purpose: str,
    order_id: str,
) -> Payment | None:
    stmt = select(Payment).where(Payment.payment_purpose == payment_purpose)
    if payment_purpose == "RETAIL_ORDER":
        stmt = stmt.where(Payment.retail_order_id == order_id)
    else:
        stmt = stmt.where(Payment.wholesale_order_id == order_id)
    stmt = stmt.where(
        Payment.payment_status.in_(
            [
                "ORDER_CREATED",
                "PENDING_VERIFICATION",
                "AUTHORIZED",
                "CAPTURED",
                "PARTIALLY_REFUNDED",
                "REFUNDED",
                "RECONCILIATION_REQUIRED",
            ]
        )
    ).order_by(Payment.created_at.desc())
    return db.scalar(stmt)


def get_latest_attempt(db: Session, payment_id: str) -> PaymentAttempt | None:
    return db.scalar(
        select(PaymentAttempt)
        .where(PaymentAttempt.payment_id == payment_id)
        .order_by(PaymentAttempt.attempt_number.desc())
    )


def append_payment_status_history(
    db: Session,
    *,
    payment: Payment,
    from_status: str | None,
    to_status: str,
    event_source: str,
    actor_user_id: str | None = None,
    provider_event_ref: str | None = None,
    notes: str | None = None,
) -> None:
    db.add(
        PaymentStatusHistory(
            id=new_uuid(),
            payment_id=payment.id,
            from_status=from_status,
            to_status=to_status,
            event_source=event_source,
            actor_user_id=actor_user_id,
            provider_event_ref=provider_event_ref,
            notes=notes,
        )
    )


def get_webhook_event_by_provider_id(db: Session, provider_event_id: str) -> PaymentWebhookEvent | None:
    return db.scalar(
        select(PaymentWebhookEvent).where(
            PaymentWebhookEvent.provider_name == "RAZORPAY",
            PaymentWebhookEvent.provider_event_id == provider_event_id,
        )
    )


def get_refund_by_idempotency(db: Session, idempotency_key: str) -> Refund | None:
    return db.scalar(select(Refund).where(Refund.idempotency_key == idempotency_key))


def sum_active_and_processed_refunds(db: Session, payment_id: str) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(Refund.amount), Decimal("0.00"))).where(
            Refund.payment_id == payment_id,
            Refund.refund_status.in_(["REQUESTED", "INITIATED", "PROCESSING", "PROCESSED"]),
        )
    )
    return Decimal(total or Decimal("0.00")).quantize(Decimal("0.01"))


def get_order_for_payment(db: Session, payment: Payment) -> RetailOrder | WholesaleOrder | None:
    if payment.payment_purpose == "RETAIL_ORDER" and payment.retail_order_id:
        return db.scalar(select(RetailOrder).where(RetailOrder.id == payment.retail_order_id))
    if payment.payment_purpose == "WHOLESALE_ORDER" and payment.wholesale_order_id:
        return db.scalar(select(WholesaleOrder).where(WholesaleOrder.id == payment.wholesale_order_id))
    return None


def list_admin_payments(
    db: Session,
    *,
    order_scope: str | None = None,
    payment_status: str | None = None,
) -> list[Payment]:
    stmt = select(Payment).order_by(Payment.created_at.desc())
    if order_scope:
        purpose_map = {"RETAIL": "RETAIL_ORDER", "WHOLESALE": "WHOLESALE_ORDER"}
        stmt = stmt.where(Payment.payment_purpose == purpose_map.get(order_scope.upper(), order_scope.upper()))
    if payment_status:
        stmt = stmt.where(Payment.payment_status == payment_status)
    return list(db.scalars(stmt).all())


def list_admin_webhook_events(db: Session, limit: int = 100) -> list[PaymentWebhookEvent]:
    return list(
        db.scalars(
            select(PaymentWebhookEvent)
            .order_by(PaymentWebhookEvent.received_at.desc())
            .limit(limit)
        ).all()
    )


def list_admin_refunds(db: Session, limit: int = 100) -> list[Refund]:
    return list(
        db.scalars(
            select(Refund).order_by(Refund.created_at.desc()).limit(limit)
        ).all()
    )
