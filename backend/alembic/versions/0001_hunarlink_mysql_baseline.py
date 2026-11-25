"""Baseline marker for the 95-table HunarLink MySQL 8.4 LTS installer.

Revision ID: 0001_hunarlink_mysql_baseline
Revises:
Create Date: 2026-11-24

Install `hunarlink-database/hunarlink_mysql_full_install.sql` first, then run:
    alembic stamp 0001_hunarlink_mysql_baseline
    alembic upgrade head

This prevents Alembic from duplicating tables already created by the MySQL
bootstrap SQL installer.
"""
from __future__ import annotations

revision = "0001_hunarlink_mysql_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No-op baseline anchor representing the 95 installed MySQL baseline tables."""
    pass


def downgrade() -> None:
    """Refuse accidental destructive drop of the entire 95-table baseline."""
    raise RuntimeError(
        "Refusing to drop the 95-table HunarLink baseline via Alembic downgrade. "
        "Restore from a verified mysqldump backup instead."
    )
