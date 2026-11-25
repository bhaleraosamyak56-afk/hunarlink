"""ASIGS Guardrails repository for checks, cases, case events, rules, and file scans."""
from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import new_uuid, utcnow
from app.models.guardrail_models import (
    FileSecurityScan,
    GuardrailCase,
    GuardrailCaseEvent,
    GuardrailCheck,
    GuardrailRule,
)
from app.modules.guardrails.schemas import FieldIssue, GuardrailOutcome


def persist_guardrail_check(
    db: Session,
    *,
    actor_user_id: str,
    workflow_name: str,
    target_type: str,
    target_id: str | None,
    outcome: GuardrailOutcome,
    issues: list[FieldIssue],
    payload_for_hash: dict[str, Any],
    correlation_id: str,
) -> GuardrailCheck:
    raw = json.dumps(payload_for_hash, default=str, sort_keys=True).encode("utf-8")
    input_hash = hashlib.sha256(raw).hexdigest()

    errors = [i.model_dump(mode="json") for i in issues if i.severity == GuardrailOutcome.BLOCK]
    warnings = [i.model_dump(mode="json") for i in issues if i.severity != GuardrailOutcome.BLOCK]
    rule_codes = sorted({i.rule_code for i in issues})

    check = GuardrailCheck(
        id=new_uuid(),
        actor_user_id=actor_user_id,
        workflow_name=workflow_name,
        target_type=target_type,
        target_id=target_id,
        outcome=outcome.value,
        triggered_rule_codes_json=rule_codes,
        field_errors_json=errors,
        warnings_json=warnings,
        input_sha256=input_hash,
        correlation_id=correlation_id,
    )
    db.add(check)
    db.flush()
    return check


def create_guardrail_case(
    db: Session,
    *,
    check: GuardrailCheck,
    submitted_by_user_id: str,
    reason_codes: list[str],
    evidence_refs: list[Any],
    correlation_id: str,
) -> GuardrailCase:
    case_number = f"GRC-{uuid.uuid4().hex[:10].upper()}"
    case = GuardrailCase(
        id=new_uuid(),
        case_number=case_number,
        guardrail_check_id=check.id,
        submitted_by_user_id=submitted_by_user_id,
        workflow_name=check.workflow_name,
        target_type=check.target_type,
        target_id=check.target_id,
        guardrail_outcome=check.outcome,
        case_status="OPEN",
        reason_codes_json=reason_codes,
        evidence_refs_json=evidence_refs,
    )
    db.add(case)
    db.flush()

    db.add(
        GuardrailCaseEvent(
            id=new_uuid(),
            guardrail_case_id=case.id,
            actor_user_id=submitted_by_user_id,
            event_type="CASE_OPENED",
            from_status=None,
            to_status="OPEN",
            reason="Submission flagged for human review by ASIGS guardrails.",
            metadata_json={"reason_codes": reason_codes},
            correlation_id=correlation_id,
        )
    )
    return case


def list_guardrail_cases(db: Session, status_filter: str | None = None) -> list[GuardrailCase]:
    stmt = select(GuardrailCase).order_by(GuardrailCase.created_at.desc())
    if status_filter:
        stmt = stmt.where(GuardrailCase.case_status == status_filter)
    return list(db.scalars(stmt).all())


def get_guardrail_case(db: Session, case_id: str) -> GuardrailCase | None:
    return db.scalar(select(GuardrailCase).where(GuardrailCase.id == case_id))


def list_guardrail_rules(db: Session) -> list[GuardrailRule]:
    return list(db.scalars(select(GuardrailRule).order_by(GuardrailRule.rule_code)).all())


def get_file_scan(db: Session, scan_id: str) -> FileSecurityScan | None:
    return db.scalar(select(FileSecurityScan).where(FileSecurityScan.id == scan_id))


def record_case_decision(
    db: Session,
    *,
    case: GuardrailCase,
    admin_user_id: str,
    decision: str,
    reason: str,
    correlation_id: str,
) -> GuardrailCase:
    prev_status = case.case_status
    status_map = {
        "APPROVE": "APPROVED",
        "REJECT": "REJECTED",
        "ESCALATE": "ESCALATED",
    }
    new_status = status_map[decision]
    case.case_status = new_status
    case.decided_by_user_id = admin_user_id
    case.decision_reason = reason
    case.decided_at = utcnow()

    db.add(
        GuardrailCaseEvent(
            id=new_uuid(),
            guardrail_case_id=case.id,
            actor_user_id=admin_user_id,
            event_type=f"ADMIN_{decision}",
            from_status=prev_status,
            to_status=new_status,
            reason=reason,
            correlation_id=correlation_id,
        )
    )
    return case
