"""Structured exceptions for Razorpay integration."""
from __future__ import annotations


class RazorpayIntegrationError(Exception):
    """Base error for Razorpay server-side integration."""


class RazorpayConfigError(RazorpayIntegrationError):
    """Raised when required Razorpay credentials are missing."""


class RazorpaySignatureError(RazorpayIntegrationError):
    """Raised when Checkout or Webhook HMAC signature validation fails."""


class RazorpayTimeoutError(RazorpayIntegrationError):
    """Raised when a Razorpay API call times out with uncertain outcome."""


class RazorpayGatewayError(RazorpayIntegrationError):
    """Raised when Razorpay explicitly rejects a request."""

    def __init__(self, message: str, code: str = "GATEWAY_ERROR") -> None:
        super().__init__(message)
        self.code = code
