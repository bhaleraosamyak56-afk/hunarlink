"""Add dedicated admin_credentials table for allowlisted email+password admin login.

Revision ID: 0003_add_admin_credentials
Revises: 0002_add_asigs_guardrail_tables
Create Date: 2026-11-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0003_add_admin_credentials"
down_revision = "0002_add_asigs_guardrail_tables"
branch_labels = None
depends_on = None


def _uuid_col() -> sa.types.TypeEngine:
    return sa.String(length=36).with_variant(
        mysql.CHAR(36, charset="ascii", collation="ascii_bin"), "mysql"
    )


def upgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("admin_credentials"):
        return

    op.create_table(
        "admin_credentials",
        sa.Column("id", _uuid_col(), nullable=False),
        sa.Column("user_id", _uuid_col(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_admin_credentials_user"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_admin_credentials_user_id"),
        sa.UniqueConstraint("email", name="uq_admin_credentials_email"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("admin_credentials"):
        op.drop_table("admin_credentials")
