"""Payment & Fulfilment state machines with strict separation & out-of-order protection.

Critical HunarLink invariants:
  1. Payment status and order fulfilment status are SEPARATE state machines.
  2. Fulfilment transitions to CONFIRMED ONLY when payment is verified CAPTURED
     (never on AUTHORIZED alone, and never from unverified browser state).
  3. Monotonic precedence protects against out-of-order webhooks: a delayed
     `payment.failed` event MUST NEVER downgrade a CAPTURED, PARTIALLY_REFUNDED,
     or REFUNDED payment!
"""
from __future__ import annotations

PAYMENT_TRANSITIONS: dict[str, set[str]] = {
    "INITIATED": {"ORDER_CREATED", "FAILED", "RECONCILIATION_REQUIRED", "CANCELLED"},
    "ORDER_CREATED": {
        "PENDING_VERIFICATION",
        "AUTHORIZED",
        "CAPTURED",
        "FAILED",
        "CANCELLED",
        "RECONCILIATION_REQUIRED",
    },
    "PENDING_VERIFICATION": {"AUTHORIZED", "CAPTURED", "FAILED", "RECONCILIATION_REQUIRED"},
    "AUTHORIZED": {"CAPTURED", "FAILED", "CANCELLED", "RECONCILIATION_REQUIRED"},
    "RECONCILIATION_REQUIRED": {"ORDER_CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED"},
    "FAILED": {"ORDER_CREATED", "CAPTURED"},  # retry or late verified capture
    "CAPTURED": {"PARTIALLY_REFUNDED", "REFUNDED"},
    "PARTIALLY_REFUNDED": {"PARTIALLY_REFUNDED", "REFUNDED"},
    "REFUNDED": set(),
    "CANCELLED": set(),
}

CAPTURED_OR_POST_CAPTURE = {"CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"}


def can_transition_payment(current_status: str, next_status: str) -> bool:
    if current_status == next_status:
        return True
    return next_status in PAYMENT_TRANSITIONS.get(current_status, set())


def is_out_of_order_downgrade(current_status: str, incoming_status: str) -> bool:
    """Return True if an older event (e.g., FAILED/AUTHORIZED) tries to downgrade CAPTURED+."""
    if current_status in CAPTURED_OR_POST_CAPTURE and incoming_status in {
        "INITIATED",
        "ORDER_CREATED",
        "PENDING_VERIFICATION",
        "AUTHORIZED",
        "FAILED",
        "CANCELLED",
    }:
        return True
    return False
