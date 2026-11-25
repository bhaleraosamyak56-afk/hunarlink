"""Add 6 Advanced Seller Input Guardrail System (ASIGS) tables for MySQL 8.4 LTS.

Revision ID: 0002_add_asigs_guardrail_tables
Revises: 0001_hunarlink_mysql_baseline
Create Date: 2026-11-24

Adds:
  - guardrail_rules
  - guardrail_checks
  - guardrail_cases
  - guardrail_case_events
  - file_security_scans
  - input_fingerprints
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0002_add_asigs_guardrail_tables"
down_revision = "0001_hunarlink_mysql_baseline"
branch_labels = None
depends_on = None


def uuid_col() -> mysql.CHAR:
    return mysql.CHAR(36, charset="ascii", collation="ascii_bin")


def upgrade() -> None:
    table_args = {
        "mysql_engine": "InnoDB",
        "mysql_charset": "utf8mb4",
        "mysql_collate": "utf8mb4_0900_ai_ci",
    }

    op.create_table(
        "guardrail_rules",
        sa.Column("id", uuid_col(), primary_key=True),
        sa.Column("rule_code", sa.String(80), nullable=False, unique=True),
        sa.Column("layer", sa.String(64), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("default_outcome", sa.String(32), nullable=False, server_default="REVIEW_REQUIRED"),
        sa.Column("is_active", mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("rule_version", sa.String(32), nullable=False, server_default="1.0.0"),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        **table_args,
    )

    op.create_table(
        "guardrail_checks",
        sa.Column("id", uuid_col(), primary_key=True),
        sa.Column("actor_user_id", uuid_col(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("workflow_name", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(80), nullable=False),
        sa.Column("target_id", sa.String(128), nullable=True),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("triggered_rule_codes_json", sa.JSON(), nullable=False),
        sa.Column("field_errors_json", sa.JSON(), nullable=False),
        sa.Column("warnings_json", sa.JSON(), nullable=False),
        sa.Column("input_sha256", mysql.CHAR(64, charset="ascii", collation="ascii_bin"), nullable=False),
        sa.Column("correlation_id", sa.String(100), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        **table_args,
    )
    op.create_index("idx_gc_actor_created", "guardrail_checks", ["actor_user_id", "created_at"])
    op.create_index("idx_gc_outcome_workflow", "guardrail_checks", ["outcome", "workflow_name"])
    op.create_index("idx_gc_correlation", "guardrail_checks", ["correlation_id"])

    op.create_table(
        "guardrail_cases",
        sa.Column("id", uuid_col(), primary_key=True),
        sa.Column("case_number", sa.String(64), nullable=False, unique=True),
        sa.Column("guardrail_check_id", uuid_col(), sa.ForeignKey("guardrail_checks.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("submitted_by_user_id", uuid_col(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("workflow_name", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(80), nullable=False),
        sa.Column("target_id", sa.String(128), nullable=True),
        sa.Column("guardrail_outcome", sa.String(32), nullable=False),
        sa.Column("case_status", sa.String(32), nullable=False, server_default="OPEN"),
        sa.Column("reason_codes_json", sa.JSON(), nullable=False),
        sa.Column("evidence_refs_json", sa.JSON(), nullable=False),
        sa.Column("decided_by_user_id", uuid_col(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decision_reason", sa.String(1000), nullable=True),
        sa.Column("decided_at", mysql.DATETIME(fsp=6), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        **table_args,
    )
    op.create_index("idx_gcase_status_created", "guardrail_cases", ["case_status", "created_at"])
    op.create_index("idx_gcase_submitter", "guardrail_cases", ["submitted_by_user_id"])

    op.create_table(
        "guardrail_case_events",
        sa.Column("id", uuid_col(), primary_key=True),
        sa.Column("guardrail_case_id", uuid_col(), sa.ForeignKey("guardrail_cases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("actor_user_id", uuid_col(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("from_status", sa.String(32), nullable=True),
        sa.Column("to_status", sa.String(32), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("correlation_id", sa.String(100), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        **table_args,
    )
    op.create_index("idx_gce_case_created", "guardrail_case_events", ["guardrail_case_id", "created_at"])

    op.create_table(
        "file_security_scans",
        sa.Column("id", uuid_col(), primary_key=True),
        sa.Column("uploader_user_id", uuid_col(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("owner_scope", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False, unique=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("claimed_content_type", sa.String(120), nullable=True),
        sa.Column("detected_mime_type", sa.String(120), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256_hash", mysql.CHAR(64, charset="ascii", collation="ascii_bin"), nullable=False),
        sa.Column("scanner_engine", sa.String(64), nullable=False),
        sa.Column("scan_status", sa.String(32), nullable=False, server_default="PENDING_SCAN"),
        sa.Column("scan_details", sa.String(500), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        **table_args,
    )
    op.create_index("idx_fss_uploader", "file_security_scans", ["uploader_user_id"])
    op.create_index("idx_fss_sha256", "file_security_scans", ["sha256_hash"])

    op.create_table(
        "input_fingerprints",
        sa.Column("id", uuid_col(), primary_key=True),
        sa.Column("actor_user_id", uuid_col(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("fingerprint_scope", sa.String(64), nullable=False),
        sa.Column("fingerprint_hash", mysql.CHAR(64, charset="ascii", collation="ascii_bin"), nullable=False),
        sa.Column("target_type", sa.String(80), nullable=False),
        sa.Column("target_id", sa.String(128), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP(6)")),
        **table_args,
    )
    op.create_index("idx_ifp_scope_hash", "input_fingerprints", ["fingerprint_scope", "fingerprint_hash"])
    op.create_index("idx_ifp_actor_created", "input_fingerprints", ["actor_user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("input_fingerprints")
    op.drop_table("file_security_scans")
    op.drop_table("guardrail_case_events")
    op.drop_table("guardrail_cases")
    op.drop_table("guardrail_checks")
    op.drop_table("guardrail_rules")
