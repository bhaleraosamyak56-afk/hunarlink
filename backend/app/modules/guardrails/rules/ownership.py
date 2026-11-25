"""Layer 9: Strict record ownership checks and server-side workflow state machine."""
from __future__ import annotations

from fastapi import HTTPException, status

ALLOWED_ASSIGNMENT_TRANSITIONS: dict[str, set[str]] = {
    "INVITED": {"ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"},
    "ACCEPTED": {"TERMS_AGREED", "CANCELLED"},
    "TERMS_AGREED": {"PO_CREATED", "CANCELLED"},
    "DECLINED": set(),
    "EXPIRED": set(),
    "CANCELLED": set(),
    "PO_CREATED": set(),
}

ALLOWED_LOT_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"UNDER_REVIEW", "APPROVED_FOR_MATCHING", "REJECTED", "CANCELLED"},
    "UNDER_REVIEW": {"APPROVED_FOR_MATCHING", "REJECTED"},
    "APPROVED_FOR_MATCHING": {"ASSIGNED", "EXPIRED", "CANCELLED"},
    "ASSIGNED": {"PARTIALLY_PROCURED", "PROCURED", "APPROVED_FOR_MATCHING"},
    "PARTIALLY_PROCURED": {"PROCURED"},
    "PROCURED": set(),
    "REJECTED": set(),
    "EXPIRED": set(),
    "CANCELLED": set(),
}


def assert_owner_or_admin(
    *,
    owner_user_id: str,
    actor_user_id: str,
    is_admin: bool = False,
    resource_label: str = "record",
) -> None:
    if is_admin:
        return
    if owner_user_id != actor_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to access another user's {resource_label}.",
        )


def assert_not_self_approval(*, submitter_user_id: str, reviewer_user_id: str) -> None:
    if submitter_user_id == reviewer_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-approval is prohibited; another authorized Admin must review.",
        )


def assert_valid_transition(
    *,
    transitions: dict[str, set[str]],
    current_status: str,
    next_status: str,
    entity_label: str,
) -> None:
    allowed = transitions.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Illegal {entity_label} transition from '{current_status}' to '{next_status}'."
            ),
        )
