"""Immutable audit log writer with automatic secret redaction."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.security import redact_sensitive
from app.models.core_models import AuditLog


def record_audit_log(
    db: Session,
    *,
    actor_user_id: str | None,
    actor_role: str,
    action: str,
    target_type: str,
    target_id: str,
    correlation_id: str,
    reason: str | None = None,
    previous_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """Append an audit_logs row with sensitive fields automatically masked."""
    entry = AuditLog(
        id=str(uuid.uuid4()),
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        reason=reason,
        previous_values_json=redact_sensitive(previous_values) if previous_values is not None else None,
        new_values_json=redact_sensitive(new_values) if new_values is not None else None,
        correlation_id=correlation_id or str(uuid.uuid4()),
        ip_address=ip_address,
        user_agent=(user_agent[:255] if user_agent else None),
    )
    db.add(entry)
    return entry
