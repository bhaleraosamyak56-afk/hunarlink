"""SQLAlchemy 2.x models for the 6 ASIGS Seller Input Guardrail tables.

Added via Alembic revision `0002_add_asigs_guardrail_tables` without duplicating
any of the 95 baseline tables.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UTCDateTime, UUIDChar, new_uuid, utcnow


class GuardrailRule(Base):
    __tablename__ = "guardrail_rules"

    id: Mapped[str] = mapped_column(UUIDChar(), primary_key=True, default=new_uuid)
    rule_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    layer: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_outcome: Mapped[str] = mapped_column(String(32), default="REVIEW_REQUIRED", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rule_version: Mapped[str] = mapped_column(String(32), default="1.0.0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False)


class GuardrailCheck(Base):
    __tablename__ = "guardrail_checks"

    id: Mapped[str] = mapped_column(UUIDChar(), primary_key=True, default=new_uuid)
    actor_user_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("users.id"), nullable=False)
    workflow_name: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    triggered_rule_codes_json: Mapped[list] = mapped_column(JSON, nullable=False)
    field_errors_json: Mapped[list] = mapped_column(JSON, nullable=False)
    warnings_json: Mapped[list] = mapped_column(JSON, nullable=False)
    input_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)


class GuardrailCase(Base):
    __tablename__ = "guardrail_cases"

    id: Mapped[str] = mapped_column(UUIDChar(), primary_key=True, default=new_uuid)
    case_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    guardrail_check_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("guardrail_checks.id"), nullable=False)
    submitted_by_user_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("users.id"), nullable=False)
    workflow_name: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    guardrail_outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    case_status: Mapped[str] = mapped_column(String(32), default="OPEN", nullable=False)
    reason_codes_json: Mapped[list] = mapped_column(JSON, nullable=False)
    evidence_refs_json: Mapped[list] = mapped_column(JSON, nullable=False)
    decided_by_user_id: Mapped[str | None] = mapped_column(UUIDChar(), ForeignKey("users.id"), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False)


class GuardrailCaseEvent(Base):
    __tablename__ = "guardrail_case_events"

    id: Mapped[str] = mapped_column(UUIDChar(), primary_key=True, default=new_uuid)
    guardrail_case_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("guardrail_cases.id"), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("users.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)


class FileSecurityScan(Base):
    __tablename__ = "file_security_scans"

    id: Mapped[str] = mapped_column(UUIDChar(), primary_key=True, default=new_uuid)
    uploader_user_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("users.id"), nullable=False)
    owner_scope: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    claimed_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    detected_mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    scanner_engine: Mapped[str] = mapped_column(String(64), nullable=False)
    scan_status: Mapped[str] = mapped_column(String(32), default="PENDING_SCAN", nullable=False)
    scan_details: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)


class InputFingerprint(Base):
    __tablename__ = "input_fingerprints"

    id: Mapped[str] = mapped_column(UUIDChar(), primary_key=True, default=new_uuid)
    actor_user_id: Mapped[str] = mapped_column(UUIDChar(), ForeignKey("users.id"), nullable=False)
    fingerprint_scope: Mapped[str] = mapped_column(String(64), nullable=False)
    fingerprint_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)
