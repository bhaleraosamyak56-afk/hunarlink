"""Dedicated raw-body Razorpay webhook receiver (`POST /api/v1/webhooks/razorpay`).

Important:
  - Does NOT require Clerk JWT (webhooks come server-to-server from Razorpay).
  - Security comes from raw-body HMAC SHA-256 verification using RAZORPAY_WEBHOOK_SECRET
    and idempotency on `x-razorpay-event-id`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.modules.payments import service
from app.modules.payments.schemas import WebhookAckResponse

webhook_router = APIRouter(tags=["Webhooks (Razorpay)"])


@webhook_router.post("/webhooks/razorpay", response_model=WebhookAckResponse)
async def receive_razorpay_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> WebhookAckResponse:
    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")
    event_id = request.headers.get("x-razorpay-event-id")
    return service.handle_razorpay_webhook(
        db,
        raw_body=raw_body,
        signature_header=signature,
        event_id_header=event_id,
        settings=settings,
    )
