"""Strict Pydantic schemas (`extra='forbid'`) for Demand Bridge & Multi-Artisan Cluster Pooling."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DemandParseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_request_text: str = Field(min_length=10, max_length=3000)


class DemandMatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw_request_text: str = Field(min_length=10, max_length=3000)
    buyer_name: str | None = Field(default=None, max_length=160)
    buyer_email: str | None = Field(default=None, max_length=255)
    category_slug: str | None = Field(default=None, max_length=140)
    craft_technique: str | None = Field(default=None, max_length=160)
    requested_quantity: int = Field(default=25, ge=1, le=5000)
    budget_min_inr: float | None = Field(default=None, ge=100, le=1000000)
    budget_max_inr: float | None = Field(default=None, ge=100, le=1000000)
    target_delivery_days: int | None = Field(default=None, ge=3, le=365)
    preferred_district: str | None = Field(default=None, max_length=100)
    requires_verified_claims: bool = False
    allow_cluster_pooling: bool = True
    customization_notes: str | None = Field(default=None, max_length=1000)


class DispatchDemandInquiryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match_ids: list[str] = Field(default_factory=list, max_length=12)
    buyer_name: str | None = Field(default=None, max_length=160)
    buyer_email: str | None = Field(default=None, max_length=255)


class ArtisanOfferRespondIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["ACCEPTED", "DECLINED"]
    response_note: str | None = Field(default=None, max_length=500)
