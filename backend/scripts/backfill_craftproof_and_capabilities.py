#!/usr/bin/env python3
"""Idempotent CraftProof Passport & Artisan Capability Backfill Script.

Safely adds the 7 CraftProof/Demand Bridge tables (if absent) and populates:
  1. Digital Craft Passports + atomic claims + timelines for all existing `seller_product_listings`
  2. Deterministic `artisan_capabilities` for all active `seller_profiles` (powers Demand Bridge & Cluster Pooling)

Never erases or modifies any existing rows in core or ASIGS tables!

Usage:
  python scripts/backfill_craftproof_and_capabilities.py
  DATABASE_URL=sqlite:////tmp/hunarlink_dev.db python scripts/backfill_craftproof_and_capabilities.py
"""
from __future__ import annotations

import pathlib
import sys

BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_engine
from app.models import Base  # registers core, guardrail & craftproof models
from app.models.core_models import SellerProductListing
from app.models.craftproof_models import (
    ArtisanCapability,
    CraftPassport,
    CraftProductClaim,
)
from app.modules.craftproof.service import ensure_passport_for_listing
from app.modules.demand_bridge.matcher import ensure_artisan_capabilities_seeded


def run_backfill() -> dict[str, int]:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        listings = list(db.scalars(select(SellerProductListing)).all())
        existing_passports = set(db.scalars(select(CraftPassport.listing_id)).all())

        created_passports = 0
        for listing in listings:
            if listing.id not in existing_passports:
                ensure_passport_for_listing(
                    db,
                    listing=listing,
                    preserve_existing_gi_verification=True,
                )
                created_passports += 1

        created_caps = ensure_artisan_capabilities_seeded(db)
        db.commit()

        totals = {
            "created_passports": created_passports,
            "total_passports": int(db.scalar(select(func.count(CraftPassport.id))) or 0),
            "total_claims": int(db.scalar(select(func.count(CraftProductClaim.id))) or 0),
            "created_capabilities": created_caps,
            "total_capabilities": int(db.scalar(select(func.count(ArtisanCapability.id))) or 0),
        }
        return totals


if __name__ == "__main__":
    summary = run_backfill()
    print(
        "[CraftProof Backfill Complete] "
        f"new_passports={summary['created_passports']} (total={summary['total_passports']}), "
        f"total_claims={summary['total_claims']}, "
        f"new_capabilities={summary['created_capabilities']} (total={summary['total_capabilities']})"
    )
