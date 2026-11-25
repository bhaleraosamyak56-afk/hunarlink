"""Layer 1: Identity, account status, profile status, role, and spoofed-ID checks."""
from __future__ import annotations

from app.core.auth import AuthenticatedPrincipal
from app.modules.guardrails.schemas import FieldIssue, GuardrailOutcome


def check_identity_and_profile(
    *,
    principal: AuthenticatedPrincipal,
    required_role: str,
    profile_id: str | None,
    profile_status: str | None,
    verification_status: str | None,
    claimed_profile_id: str | None = None,
    require_approved_verification: bool = True,
) -> list[FieldIssue]:
    issues: list[FieldIssue] = []

    if principal.account_status != "ACTIVE":
        issues.append(
            FieldIssue(
                field="account_status",
                rule_code="ID_ACCOUNT_INACTIVE",
                severity=GuardrailOutcome.BLOCK,
                message=f"Account status '{principal.account_status}' cannot perform this action.",
            )
        )

    if not principal.has_role(required_role):
        issues.append(
            FieldIssue(
                field="role",
                rule_code="ID_MISSING_ROLE",
                severity=GuardrailOutcome.BLOCK,
                message=f"Authenticated account lacks required platform role '{required_role}'.",
            )
        )

    if profile_id is None:
        issues.append(
            FieldIssue(
                field="profile",
                rule_code="ID_PROFILE_NOT_FOUND",
                severity=GuardrailOutcome.BLOCK,
                message=f"No active {required_role.lower()} profile is linked to this account.",
            )
        )
        return issues

    if claimed_profile_id and claimed_profile_id != profile_id:
        issues.append(
            FieldIssue(
                field="claimed_profile_id",
                rule_code="ID_SPOOFED_OWNER",
                severity=GuardrailOutcome.BLOCK,
                message="Request body attempted to act on behalf of another profile ID.",
            )
        )

    if profile_status != "ACTIVE":
        issues.append(
            FieldIssue(
                field="profile_status",
                rule_code="ID_PROFILE_SUSPENDED_OR_INACTIVE",
                severity=GuardrailOutcome.BLOCK,
                message=f"Profile status '{profile_status}' is not eligible to publish or submit.",
            )
        )

    if require_approved_verification and verification_status != "APPROVED":
        issues.append(
            FieldIssue(
                field="verification_status",
                rule_code="ID_PROFILE_UNVERIFIED",
                severity=GuardrailOutcome.BLOCK,
                message=f"Verification status '{verification_status}' must be APPROVED first.",
            )
        )

    return issues
