"""Idempotent local development SQLite preview seeder for HunarLink FastAPI.

Strictly restricted to non-production SQLite preview databases (e.g.
`DATABASE_URL=sqlite:////tmp/hunarlink_dev.db`) so developers and sandbox
previews can verify all 53 verified Kashmiri artisans and 96 authentic craft
listings with unique database UUIDs without requiring a local MySQL daemon.
Production deployments use MySQL 8.4 LTS via Alembic + `seed_real_artisans.py`.
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings
from scripts.seed_real_artisans import seed_artisans_and_catalog


def seed_sqlite_dev_preview() -> None:
    settings = get_settings()
    if settings.app_env == "production":
        raise SystemExit("Refusing to run dev preview seeder in production mode.")

    db_url = settings.database_url or ""
    if not db_url.startswith("sqlite"):
        raise SystemExit(
            "seed_dev_preview.py only targets local SQLite dev URLs "
            "(e.g. DATABASE_URL=sqlite:////tmp/hunarlink_dev.db)."
        )

    seed_artisans_and_catalog()


if __name__ == "__main__":
    seed_sqlite_dev_preview()
