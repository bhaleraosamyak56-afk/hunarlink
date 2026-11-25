"""Add dedicated admin_credentials table for allowlisted email+password admin login.

Revision ID: 0003_add_admin_credentials
Revises: 0002_add_asigs_guardrail_tables
Create Date: 2026-11-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_add_admin_credentials"
down_revision = "0002_add_asigs_guardrail_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_credentials",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
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
    )


def downgrade() -> None:
    op.drop_table("admin_credentials")
