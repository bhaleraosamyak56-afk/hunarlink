"""Layer 6: Commercial validation (Decimal money, currency, MOQ, price tiers, warnings).

Rules:
  - Monetary values use `Decimal` (never `float`).
  - Supported initial currency is `INR`.
  - Wholesale price tiers must be strictly ascending in min_quantity, non-overlapping,
    at or above MOQ, and monotonically non-increasing in unit_price (no bulk penalty).
  - Extreme outlier prices produce a `WARNING` / `REVIEW_REQUIRED` signal, NOT
    an automatic fraud accusation or permanent ban.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.modules.guardrails.schemas import (
    FieldIssue,
    GuardrailOutcome,
    WholesalePriceTierInput,
)

SUPPORTED_CURRENCIES = {"INR"}


def validate_currency(currency_code: str) -> list[FieldIssue]:
    code = (currency_code or "").strip().upper()
    if code not in SUPPORTED_CURRENCIES:
        return [
            FieldIssue(
                field="currency_code",
                rule_code="COMM_UNSUPPORTED_CURRENCY",
                severity=GuardrailOutcome.BLOCK,
                message=f"Currency '{code}' is not supported; supported currencies: {', '.join(sorted(SUPPORTED_CURRENCIES))}.",
            )
        ]
    return []


def validate_retail_pricing(
    *,
    selling_price: Decimal,
    compare_at_mrp: Decimal | None,
    reference_mrp: Decimal | None,
    currency_code: str,
) -> list[FieldIssue]:
    issues = validate_currency(currency_code)

    if selling_price <= Decimal("0"):
        issues.append(
            FieldIssue(
                field="selling_price",
                rule_code="COMM_NON_POSITIVE_PRICE",
                severity=GuardrailOutcome.BLOCK,
                message="Selling price must be strictly greater than zero.",
            )
        )

    if compare_at_mrp is not None and compare_at_mrp < selling_price:
        issues.append(
            FieldIssue(
                field="compare_at_mrp",
                rule_code="COMM_MRP_BELOW_SELLING_PRICE",
                severity=GuardrailOutcome.BLOCK,
                message="compare_at_mrp cannot be lower than selling_price.",
            )
        )

    # Unusual price outlier -> WARNING signal only (not automatic fraud proof)
    if reference_mrp and reference_mrp > Decimal("0") and selling_price > Decimal("0"):
        ratio = selling_price / reference_mrp
        if ratio < Decimal("0.20") or ratio > Decimal("3.00"):
            issues.append(
                FieldIssue(
                    field="selling_price",
                    rule_code="COMM_UNUSUAL_PRICE_OUTLIER",
                    severity=GuardrailOutcome.WARNING,
                    message=(
                        f"Selling price ({selling_price}) diverges significantly from reference MRP "
                        f"({reference_mrp}); flagged as a review signal only."
                    ),
                )
            )

    return issues


def validate_wholesale_price_tiers(
    *,
    base_unit_price: Decimal,
    minimum_order_quantity: Decimal,
    tiers: list[WholesalePriceTierInput],
    currency_code: str,
) -> list[FieldIssue]:
    issues = validate_currency(currency_code)

    if minimum_order_quantity <= Decimal("0"):
        issues.append(
            FieldIssue(
                field="minimum_order_quantity",
                rule_code="COMM_INVALID_MOQ",
                severity=GuardrailOutcome.BLOCK,
                message="Minimum order quantity (MOQ) must be positive.",
            )
        )

    if not tiers:
        return issues

    sorted_tiers = sorted(tiers, key=lambda t: t.min_quantity)
    prev_min: Decimal | None = None
    prev_max: Decimal | None = None
    prev_price: Decimal | None = None

    for idx, tier in enumerate(sorted_tiers):
        prefix = f"price_tiers[{idx}]"
        if tier.min_quantity < minimum_order_quantity:
            issues.append(
                FieldIssue(
                    field=prefix,
                    rule_code="COMM_TIER_BELOW_MOQ",
                    severity=GuardrailOutcome.BLOCK,
                    message=f"Tier min_quantity ({tier.min_quantity}) cannot be less than MOQ ({minimum_order_quantity}).",
                )
            )
        if tier.max_quantity is not None and tier.max_quantity < tier.min_quantity:
            issues.append(
                FieldIssue(
                    field=prefix,
                    rule_code="COMM_TIER_MAX_BELOW_MIN",
                    severity=GuardrailOutcome.BLOCK,
                    message="Tier max_quantity must be >= min_quantity.",
                )
            )
        if tier.unit_price > base_unit_price:
            issues.append(
                FieldIssue(
                    field=prefix,
                    rule_code="COMM_TIER_ABOVE_BASE_PRICE",
                    severity=GuardrailOutcome.BLOCK,
                    message="Wholesale tier unit_price cannot exceed base_unit_price.",
                )
            )
        if prev_min is not None:
            if tier.min_quantity == prev_min:
                issues.append(
                    FieldIssue(
                        field=prefix,
                        rule_code="COMM_TIER_DUPLICATE_MIN_QTY",
                        severity=GuardrailOutcome.BLOCK,
                        message="Duplicate min_quantity detected across wholesale price tiers.",
                    )
                )
            if prev_max is None or tier.min_quantity <= prev_max:
                issues.append(
                    FieldIssue(
                        field=prefix,
                        rule_code="COMM_TIER_OVERLAP",
                        severity=GuardrailOutcome.BLOCK,
                        message="Wholesale price tiers overlap in quantity range.",
                    )
                )
            if prev_price is not None and tier.unit_price > prev_price:
                issues.append(
                    FieldIssue(
                        field=prefix,
                        rule_code="COMM_TIER_NON_MONOTONIC_PRICE",
                        severity=GuardrailOutcome.BLOCK,
                        message="Higher quantity tier cannot have a higher unit_price than a lower tier.",
                    )
                )

        prev_min = tier.min_quantity
        prev_max = tier.max_quantity
        prev_price = tier.unit_price

    return issues


def validate_date_window(
    available_from: date,
    available_until: date | None,
) -> list[FieldIssue]:
    if available_until is not None and available_until < available_from:
        return [
            FieldIssue(
                field="available_until_date",
                rule_code="COMM_INVALID_DATE_WINDOW",
                severity=GuardrailOutcome.BLOCK,
                message="available_until_date cannot precede available_from_date.",
            )
        ]
    return []
