"""Layer 5: GI vs Non-GI verification guardrails.

Enforces:
  - NON_GI applications use Admin manual review and NEVER invoke any GI LLM provider.
  - GI applications without supporting evidence enter REVIEW_REQUIRED (never auto-approved).
  - Provider outputs are strictly schema-validated; invalid LLM output is rejected.
  - Prompt injections in untrusted text NEVER trigger privileged actions or approvals.
  - Seller verification and product GI verification remain separate decisions.
"""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.core_models import (
    GIReferenceRecord,
    GIVerificationRun,
    SellerVerificationApplication,
)
from app.modules.guardrails.providers.gi_llm_base import (
    BaseGILLMProvider,
    GIAssessmentOutput,
    GIAssessmentRequest,
    GIAssessmentVerdict,
)
from app.modules.guardrails.providers.gi_llm_mock import validate_llm_output
from app.modules.guardrails.schemas import FieldIssue, GuardrailOutcome


def evaluate_verification_application(
    db: Session,
    *,
    application: SellerVerificationApplication,
    evidence_scan_ids: list[str],
    untrusted_claim_text: str | None,
    llm_provider: BaseGILLMProvider | None,
    dataset_version: str,
) -> tuple[GuardrailOutcome, list[FieldIssue], GIVerificationRun | None]:
    issues: list[FieldIssue] = []

    # HARD INVARIANT: Non-GI path must NEVER call the GI LLM!
    if application.verification_path == "NON_GI":
        issues.append(
            FieldIssue(
                field="verification_path",
                rule_code="GI_NON_GI_MANUAL_ONLY",
                severity=GuardrailOutcome.REVIEW_REQUIRED,
                message="Non-GI seller applications follow manual Admin review; GI LLM is not invoked.",
            )
        )
        return GuardrailOutcome.REVIEW_REQUIRED, issues, None

    # GI path requires supporting evidence
    if not evidence_scan_ids:
        issues.append(
            FieldIssue(
                field="evidence_scan_ids",
                rule_code="GI_MISSING_EVIDENCE",
                severity=GuardrailOutcome.REVIEW_REQUIRED,
                message="GI verification claim lacks supporting evidence documents; routed to human review.",
            )
        )
        return GuardrailOutcome.REVIEW_REQUIRED, issues, None

    # Lookup trusted GI reference record (if dataset is populated)
    ref_record = None
    if application.claimed_gi_code:
        ref_record = db.scalar(
            select(GIReferenceRecord).where(
                GIReferenceRecord.gi_registration_number == application.claimed_gi_code.strip(),
                GIReferenceRecord.is_active == True,  # noqa: E712
            )
        )

    if llm_provider is None:
        issues.append(
            FieldIssue(
                field="gi_llm_provider",
                rule_code="GI_PROVIDER_UNCONFIGURED_MANUAL_REVIEW",
                severity=GuardrailOutcome.REVIEW_REQUIRED,
                message="GI LLM provider is not enabled; routed to human Admin GI review.",
            )
        )
        return GuardrailOutcome.REVIEW_REQUIRED, issues, None

    req = GIAssessmentRequest(
        claimed_gi_code=application.claimed_gi_code,
        claimed_craft_cluster=application.claimed_craft_cluster,
        reference_gi_code=ref_record.gi_registration_number if ref_record else None,
        reference_geographic_area=ref_record.authorized_geographic_area if ref_record else None,
        evidence_reference_ids=list(evidence_scan_ids),
        untrusted_seller_text=untrusted_claim_text or "",
        dataset_version=ref_record.dataset_version if ref_record else dataset_version,
    )

    raw_output = llm_provider.assess(req)
    # Strictly validate provider response — reject malformed/unauthorized LLM output!
    try:
        parsed: GIAssessmentOutput = validate_llm_output(raw_output)
    except Exception as exc:
        issues.append(
            FieldIssue(
                field="gi_llm_output",
                rule_code="GI_INVALID_LLM_OUTPUT_REJECTED",
                severity=GuardrailOutcome.BLOCK,
                message=f"Rejected invalid GI assessment output: {exc}",
            )
        )
        return GuardrailOutcome.BLOCK, issues, None

    canonical_input = json.dumps(req.model_dump(mode="json"), sort_keys=True).encode("utf-8")
    input_hash = hashlib.sha256(canonical_input).hexdigest()

    run = GIVerificationRun(
        target_type="SELLER_APPLICATION",
        seller_application_id=application.id,
        gi_reference_record_id=ref_record.id if ref_record else None,
        provider_name=parsed.provider_name,
        model_version=parsed.model_version,
        prompt_version=parsed.prompt_version,
        dataset_version=parsed.dataset_version,
        input_sha256=input_hash,
        evidence_reference_ids=list(evidence_scan_ids),
        assessment_outcome=parsed.assessment_outcome.value,
        confidence_score=parsed.confidence_score,
        structured_findings_json=parsed.model_dump(mode="json"),
        is_legal_proof=False,
        is_mock_provider=parsed.is_mock_provider,
        human_review_decision="PENDING",
    )
    db.add(run)

    if parsed.prompt_injection_suspected:
        issues.append(
            FieldIssue(
                field="untrusted_claim_text",
                rule_code="GI_PROMPT_INJECTION_FLAGGED",
                severity=GuardrailOutcome.REVIEW_REQUIRED,
                message="Untrusted text contained instruction-like patterns; isolated and escalated for human review.",
            )
        )
        return GuardrailOutcome.REVIEW_REQUIRED, issues, run

    if parsed.assessment_outcome in (
        GIAssessmentVerdict.CONFLICT_DETECTED,
        GIAssessmentVerdict.INSUFFICIENT_EVIDENCE,
        GIAssessmentVerdict.NEEDS_HUMAN_REVIEW,
    ):
        issues.append(
            FieldIssue(
                field="claimed_gi_code",
                rule_code="GI_ASSESSMENT_REQUIRES_HUMAN_REVIEW",
                severity=GuardrailOutcome.REVIEW_REQUIRED,
                message=parsed.summary,
            )
        )
        return GuardrailOutcome.REVIEW_REQUIRED, issues, run

    # Even LIKELY_MATCH NEVER auto-approves the seller; human approval remains required.
    issues.append(
        FieldIssue(
            field="claimed_gi_code",
            rule_code="GI_LIKELY_MATCH_PENDING_HUMAN_DECISION",
            severity=GuardrailOutcome.REVIEW_REQUIRED,
            message="Evidence assessment complete; human Admin approval is still required (assessment is not legal proof).",
        )
    )
    return GuardrailOutcome.REVIEW_REQUIRED, issues, run
