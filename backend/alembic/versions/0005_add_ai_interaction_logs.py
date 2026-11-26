"""Add ai_interaction_logs table to persist every local/cloud LLM audit record.

Revision ID: 0005_add_ai_interaction_logs
Revises: 0004_add_craftproof_and_demand_bridge
Create Date: 2026-11-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0005_add_ai_interaction_logs"
down_revision = "0004_add_craftproof_and_demand_bridge"
branch_labels = None
depends_on = None


def _uuid_col() -> sa.types.TypeEngine:
    return sa.String(length=36).with_variant(
        mysql.CHAR(36, charset="ascii", collation="ascii_bin"), "mysql"
    )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("ai_interaction_logs"):
        return

    op.create_table(
        "ai_interaction_logs",
        sa.Column("id", _uuid_col(), nullable=False),
        sa.Column("workflow_type", sa.String(length=48), nullable=False),
        sa.Column("actor_user_id", _uuid_col(), nullable=True),
        sa.Column("target_type", sa.String(length=48), nullable=True),
        sa.Column("target_ref", sa.String(length=128), nullable=True),
        sa.Column("provider_used", sa.String(length=48), nullable=False),
        sa.Column("model_used", sa.String(length=80), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_text", sa.Text(), nullable=False),
        sa.Column("output_summary", sa.Text(), nullable=False),
        sa.Column("output_json", sa.JSON(), nullable=False),
        sa.Column("overclaim_guard_triggered", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_legal_proof", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name="fk_ail_actor"),
        sa.CheckConstraint("is_legal_proof = 0", name="chk_ail_not_legal_proof"),
        sa.PrimaryKeyConstraint("id"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("ai_interaction_logs"):
        op.drop_table("ai_interaction_logs")
