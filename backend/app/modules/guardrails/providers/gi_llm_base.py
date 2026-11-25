"""Abstract GI evidence assessment LLM provider interface.

Security invariants:
  1. An LLM provider ONLY returns a structured `GIAssessmentOutput` DTO.
  2. It has ZERO database session access, ZERO tool-calling capabilities, and
     ZERO ability to approve a seller, verify a product, or mutate statuses.
  3. Its result is ALWAYS an advisory assessment (`is_legal_proof = False`).
  4. All seller-submitted text and document extracts are treated as UNTRUSTED data.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class GIAssessmentVerdict(str, Enum):
    LIKELY_MATCH = "LIKELY_MATCH"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"
    CONFLICT_DETECTED = "CONFLICT_DETECTED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class GIAssessmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claimed_gi_code: str | None
    claimed_craft_cluster: str | None
    reference_gi_code: str | None
    reference_geographic_area: str | None
    evidence_reference_ids: list[str]
    untrusted_seller_text: str = ""
    dataset_version: str


class GIAssessmentOutput(BaseModel):
    """Strict output contract; any extra keys or invalid values are rejected."""

    model_config = ConfigDict(extra="forbid")

    provider_name: str = Field(..., min_length=2, max_length=80)
    model_version: str = Field(..., min_length=2, max_length=120)
    prompt_version: str = Field(..., min_length=2, max_length=64)
    dataset_version: str = Field(..., min_length=2, max_length=64)
    assessment_outcome: GIAssessmentVerdict
    confidence_score: Decimal = Field(..., ge=Decimal("0"), le=Decimal("100"))
    matching_fields: list[str] = Field(default_factory=list)
    conflicting_fields: list[str] = Field(default_factory=list)
    summary: str = Field(..., min_length=5, max_length=1000)
    prompt_injection_suspected: bool = False
    # Always False; human Admin review is required for final business approval.
    is_legal_proof: bool = Field(default=False)
    is_mock_provider: bool = Field(default=False)


class BaseGILLMProvider(ABC):
    """Read-only evidence comparison contract for future custom GI LLM."""

    @abstractmethod
    def assess(self, req: GIAssessmentRequest) -> dict:
        """Return raw structured dictionary validated strictly against GIAssessmentOutput."""
        raise NotImplementedError
