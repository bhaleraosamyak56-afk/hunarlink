"""Strict Pydantic schemas (`extra='forbid'`) for HunarLink CraftProof AI endpoints."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ArtisanDocPreScreenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_scan_id: str | None = Field(default=None, max_length=64)
    application_id: str | None = Field(default=None, max_length=64)
    store_name: str = Field(min_length=2, max_length=160)
    craft_specialty: str = Field(min_length=2, max_length=160)
    workshop_district: str = Field(min_length=2, max_length=100)
    verification_path: Literal["GI", "NON_GI"] = "NON_GI"
    claimed_gi_code: str | None = Field(default=None, max_length=120)
    document_text_snippet: str | None = Field(default=None, max_length=4000)


class ArtisanCopilotDraftIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_note: str = Field(min_length=8, max_length=3000)
    language_hint: str | None = Field(default="auto", max_length=32)
    seller_district: str | None = Field(default=None, max_length=100)
    seller_craft_specialty: str | None = Field(default=None, max_length=160)


class CraftAuditListingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=220)
    description: str | None = Field(default="", max_length=4000)
    craft_technique: str | None = Field(default=None, max_length=160)
    material_composition: str | None = Field(default=None, max_length=255)
    origin_district: str | None = Field(default=None, max_length=100)
    selling_price_inr: float = Field(gt=0, le=5000000)
    stock_quantity: int = Field(default=1, ge=0, le=100000)
    craft_days_claimed: int | None = Field(default=None, ge=1, le=730)
    claimed_gi_code: str | None = Field(default=None, max_length=120)
    seller_verification_path: Literal["GI", "NON_GI"] | None = None
    seller_workshop_district: str | None = Field(default=None, max_length=100)
    passport_id: str | None = Field(default=None, max_length=64)


class BuyerAssistantAskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passport_code: str | None = Field(default=None, max_length=64)
    product_ref: str | None = Field(default=None, max_length=240)
    question: str = Field(min_length=3, max_length=1000)
