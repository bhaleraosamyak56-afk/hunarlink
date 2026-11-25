"""Layer 8: Measured duplicate & risk indicators (escalate for review, never auto-ban)."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import new_uuid
from app.models.guardrail_models import InputFingerprint
from app.modules.guardrails.schemas import FieldIssue, GuardrailOutcome


def compute_normalized_fingerprint(parts: dict[str, Any]) -> str:
    normalized = {}
    for k, v in sorted(parts.items()):
        if isinstance(v, str):
            normalized[k] = " ".join(v.strip().lower().split())
        else:
            normalized[k] = str(v)
    raw = json.dumps(normalized, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def check_and_record_duplicate(
    db: Session,
    *,
    actor_user_id: str,
    scope: str,
    fingerprint_hash: str,
    target_type: str,
    target_id: str | None,
    persist: bool,
) -> list[FieldIssue]:
    existing = db.scalar(
        select(InputFingerprint).where(
            InputFingerprint.fingerprint_scope == scope,
            InputFingerprint.fingerprint_hash == fingerprint_hash,
        )
    )
    issues: list[FieldIssue] = []
    if existing is not None:
        issues.append(
            FieldIssue(
                field="submission",
                rule_code=f"DUP_{scope.upper()}_DETECTED",
                severity=GuardrailOutcome.REVIEW_REQUIRED,
                message=(
                    f"Potential duplicate submission detected in scope '{scope}' "
                    f"(matched prior fingerprint {existing.id}); escalated for human review."
                ),
            )
        )
    if persist:
        db.add(
            InputFingerprint(
                id=new_uuid(),
                actor_user_id=actor_user_id,
                fingerprint_scope=scope,
                fingerprint_hash=fingerprint_hash,
                target_type=target_type,
                target_id=target_id,
            )
        )
    return issues
