"""Thin, timeout-safe wrapper around the official Razorpay Python SDK (`razorpay`).

Never prints or logs API secrets or raw payment credentials.
"""
from __future__ import annotations

from typing import Protocol

import razorpay
import requests

from app.core.config import Settings
from app.integrations.razorpay.exceptions import (
    RazorpayConfigError,
    RazorpayGatewayError,
    RazorpayTimeoutError,
)
from app.integrations.razorpay.schemas import (
    RazorpayOrderDTO,
    RazorpayPaymentDTO,
    RazorpayRefundDTO,
)


class RazorpayGatewayProtocol(Protocol):
    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str],
    ) -> RazorpayOrderDTO: ...

    def fetch_payment(self, *, razorpay_payment_id: str) -> RazorpayPaymentDTO: ...

    def create_refund(
        self,
        *,
        razorpay_payment_id: str,
        amount_paise: int,
        notes: dict[str, str],
    ) -> RazorpayRefundDTO: ...


class OfficialRazorpayClient:
    """Production/Test Mode wrapper around `razorpay.Client` with strict timeouts."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: razorpay.Client | None = None

    def _get_sdk_client(self) -> razorpay.Client:
        key_id = self.settings.razorpay_key_id.strip()
        key_secret = self.settings.razorpay_key_secret.get_secret_value().strip()
        if not key_id or not key_secret:
            raise RazorpayConfigError(
                "Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured."
            )
        if self._client is None:
            client = razorpay.Client(auth=(key_id, key_secret))
            client.set_app_details({"title": "HunarLink", "version": "1.0.0"})
            self._client = client
        return self._client

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str],
    ) -> RazorpayOrderDTO:
        sdk = self._get_sdk_client()
        payload = {
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt[:40],
            "payment_capture": 1,
            "notes": notes,
        }
        try:
            data = sdk.order.create(data=payload, timeout=self.settings.razorpay_timeout_seconds)
            return RazorpayOrderDTO.model_validate(data)
        except requests.Timeout as exc:
            raise RazorpayTimeoutError("Timed out while creating Razorpay order.") from exc
        except Exception as exc:
            raise RazorpayGatewayError(f"Razorpay order creation failed: {type(exc).__name__}") from exc

    def fetch_payment(self, *, razorpay_payment_id: str) -> RazorpayPaymentDTO:
        sdk = self._get_sdk_client()
        try:
            data = sdk.payment.fetch(
                razorpay_payment_id,
                timeout=self.settings.razorpay_timeout_seconds,
            )
            return RazorpayPaymentDTO.model_validate(data)
        except requests.Timeout as exc:
            raise RazorpayTimeoutError("Timed out while fetching Razorpay payment status.") from exc
        except Exception as exc:
            raise RazorpayGatewayError(f"Razorpay payment fetch failed: {type(exc).__name__}") from exc

    def create_refund(
        self,
        *,
        razorpay_payment_id: str,
        amount_paise: int,
        notes: dict[str, str],
    ) -> RazorpayRefundDTO:
        sdk = self._get_sdk_client()
        try:
            data = sdk.payment.refund(
                razorpay_payment_id,
                {"amount": amount_paise, "notes": notes},
                timeout=self.settings.razorpay_timeout_seconds,
            )
            return RazorpayRefundDTO.model_validate(data)
        except requests.Timeout as exc:
            raise RazorpayTimeoutError("Timed out while creating Razorpay refund.") from exc
        except Exception as exc:
            raise RazorpayGatewayError(f"Razorpay refund creation failed: {type(exc).__name__}") from exc
