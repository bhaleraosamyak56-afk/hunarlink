"""Constant-time HMAC SHA-256 signature verification for Razorpay Checkout & Webhooks.

Official Razorpay rules:
  1. Checkout callback signature: HMAC-SHA256(f"{stored_order_id}|{payment_id}", RAZORPAY_KEY_SECRET)
     ALWAYS pass the order_id loaded from HunarLink's database, never an untrusted browser order_id.
  2. Webhook signature: HMAC-SHA256(exact_raw_request_bytes, RAZORPAY_WEBHOOK_SECRET)
     ALWAYS keep RAZORPAY_WEBHOOK_SECRET strictly separate from RAZORPAY_KEY_SECRET.
  3. ALWAYS compare digests using `hmac.compare_digest` (constant-time).
"""
from __future__ import annotations

import hashlib
import hmac

from app.integrations.razorpay.exceptions import RazorpayConfigError, RazorpaySignatureError


def compute_checkout_signature(
    *,
    stored_razorpay_order_id: str,
    razorpay_payment_id: str,
    key_secret: str,
) -> str:
    if not key_secret:
        raise RazorpayConfigError("RAZORPAY_KEY_SECRET is not configured.")
    message = f"{stored_razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
    return hmac.new(key_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_checkout_signature(
    *,
    stored_razorpay_order_id: str,
    razorpay_payment_id: str,
    provided_signature: str,
    key_secret: str,
) -> None:
    if not provided_signature:
        raise RazorpaySignatureError("Missing razorpay_signature.")
    expected = compute_checkout_signature(
        stored_razorpay_order_id=stored_razorpay_order_id,
        razorpay_payment_id=razorpay_payment_id,
        key_secret=key_secret,
    )
    if not hmac.compare_digest(expected, provided_signature.strip()):
        raise RazorpaySignatureError("Checkout payment signature verification failed.")


def compute_webhook_signature(*, raw_body: bytes, webhook_secret: str) -> str:
    if not webhook_secret:
        raise RazorpayConfigError("RAZORPAY_WEBHOOK_SECRET is not configured.")
    return hmac.new(webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def verify_webhook_signature(
    *,
    raw_body: bytes,
    provided_signature: str | None,
    webhook_secret: str,
) -> None:
    if not provided_signature:
        raise RazorpaySignatureError("Missing X-Razorpay-Signature header.")
    expected = compute_webhook_signature(raw_body=raw_body, webhook_secret=webhook_secret)
    if not hmac.compare_digest(expected, provided_signature.strip()):
        raise RazorpaySignatureError("Webhook HMAC signature verification failed.")
