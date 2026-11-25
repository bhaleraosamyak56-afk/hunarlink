"""Clearly labelled workflow-testing mock GI provider (NEVER real legal GI proof).

Demonstrates:
  - Strict separation from DB/tools (read-only pure function).
  - Prompt-injection detection in untrusted seller text/documents without
    allowing any privileged override.
  - Strict Pydantic validation of provider output before acceptance.
"""
from __future__ import annotations

import re
from decimal import Decimal

from app.modules.guardrails.providers.gi_llm_base import (
    BaseGILLMProvider,
    GIAssessmentOutput,
    GIAssessmentRequest,
    GIAssessmentVerdict,
)

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions", re.IGNORECASE),
    re.compile(r"auto[- ]?approve|mark\s+as\s+gi[_\s]?verified", re.IGNORECASE),
    re.compile(r"system\s+prompt|override\s+admin|grant\s+super[_\s]?admin", re.IGNORECASE),
    re.compile(r"execute\s+sql|drop\s+table|update\s+seller_profiles", re.IGNORECASE),
]


def detect_prompt_injection(untrusted_text: str) -> bool:
    if not untrusted_text:
        return False
    return any(p.search(untrusted_text) for p in PROMPT_INJECTION_PATTERNS)


class MockGIWorkflowProvider(BaseGILLMProvider):
    """Workflow-only mock provider; explicitly flagged `is_mock_provider=True`."""

    provider_name = "mock-gi-workflow-provider"
    model_version = "mock-v0-not-for-production"
    prompt_version = "gi-assess-v1"

    def assess(self, req: GIAssessmentRequest) -> dict:
        injection_detected = detect_prompt_injection(req.untrusted_seller_text)
        if injection_detected:
            return {
                "provider_name": self.provider_name,
                "model_version": self.model_version,
                "prompt_version": self.prompt_version,
                "dataset_version": req.dataset_version,
                "assessment_outcome": GIAssessmentVerdict.NEEDS_HUMAN_REVIEW.value,
                "confidence_score": Decimal("0.00"),
                "matching_fields": [],
                "conflicting_fields": ["untrusted_text_instruction_override_attempt"],
                "summary": (
                    "Mock workflow check flagged instruction-like text in untrusted input; "
                    "routed to mandatory human Admin review. No privileged actions taken."
                ),
                "prompt_injection_suspected": True,
                "is_legal_proof": False,
                "is_mock_provider": True,
            }

        if not req.evidence_reference_ids:
            return {
                "provider_name": self.provider_name,
                "model_version": self.model_version,
                "prompt_version": self.prompt_version,
                "dataset_version": req.dataset_version,
                "assessment_outcome": GIAssessmentVerdict.INSUFFICIENT_EVIDENCE.value,
                "confidence_score": Decimal("10.00"),
                "matching_fields": [],
                "conflicting_fields": ["missing_supporting_documents"],
                "summary": "No supporting GI evidence documents were attached; human review required.",
                "prompt_injection_suspected": False,
                "is_legal_proof": False,
                "is_mock_provider": True,
            }

        matching: list[str] = []
        conflicting: list[str] = []
        if req.claimed_gi_code and req.reference_gi_code:
            if req.claimed_gi_code.strip().upper() == req.reference_gi_code.strip().upper():
                matching.append("gi_registration_number")
            else:
                conflicting.append("gi_registration_number")
        else:
            conflicting.append("gi_reference_record_missing")

        if req.claimed_craft_cluster and req.reference_geographic_area:
            if req.claimed_craft_cluster.strip().lower() in req.reference_geographic_area.lower():
                matching.append("authorized_geographic_area")
            else:
                conflicting.append("authorized_geographic_area")

        if matching and not conflicting:
            outcome = GIAssessmentVerdict.LIKELY_MATCH.value
            score = Decimal("85.00")
            summary = "Mock workflow check found matching reference fields; awaiting mandatory human approval."
        elif conflicting:
            outcome = GIAssessmentVerdict.CONFLICT_DETECTED.value
            score = Decimal("30.00")
            summary = "Mock workflow check detected mismatch or missing GI reference; routed to human review."
        else:
            outcome = GIAssessmentVerdict.NEEDS_HUMAN_REVIEW.value
            score = Decimal("50.00")
            summary = "Mock workflow check requires manual Admin verification."

        return {
            "provider_name": self.provider_name,
            "model_version": self.model_version,
            "prompt_version": self.prompt_version,
            "dataset_version": req.dataset_version,
            "assessment_outcome": outcome,
            "confidence_score": score,
            "matching_fields": matching,
            "conflicting_fields": conflicting,
            "summary": summary,
            "prompt_injection_suspected": False,
            "is_legal_proof": False,
            "is_mock_provider": True,
        }


def validate_llm_output(raw_output: dict) -> GIAssessmentOutput:
    """Strictly validate provider output; reject malformed or unauthorized payloads."""
    parsed = GIAssessmentOutput.model_validate(raw_output)
    if parsed.is_legal_proof:
        raise ValueError("GI LLM output must never claim is_legal_proof=True.")
    return parsed
