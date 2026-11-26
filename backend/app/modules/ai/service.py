"""CraftProof AI Domain Services (Strictly Advisory, Anti-Hallucination & Evidence-Locked).

Implements:
  1A. `prescreen_artisan_document` — GI / Artisan Card document pre-screening for `/auth?tab=verify` & Admin
  1B. `audit_craft_listing` — Adversarial CraftProof Claim & Craft-Economics Auditor
  2.  `draft_artisan_listing` — Hinglish / Hindi / English Voice-to-Passport Copilot + Fair-Craft Breakdown
  3.  `answer_buyer_passport_question` — Refuses-to-Lie Evidence-Locked Buyer Assistant
"""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.core_models import (
    GIReferenceRecord,
    SellerProfile,
    SellerVerificationApplication,
)
from app.models.craftproof_models import (
    CraftPassport,
    CraftVerificationEvent,
)
from app.models.guardrail_models import FileSecurityScan
from app.modules.ai.doc_extractor import extract_document_signals
from app.modules.ai.provider import LocalAIGateway
from app.modules.ai.schemas import (
    ArtisanCopilotDraftIn,
    ArtisanDocPreScreenIn,
    BuyerAssistantAskIn,
    CraftAuditListingIn,
)
from app.modules.craftproof.service import (
    build_fair_craft_breakdown,
    resolve_or_create_passport_by_product,
    resolve_passport_by_code_or_slug,
    serialize_passport_public,
)

# ---------------------------------------------------------------------------
# Deterministic Craft-Economics Plausibility Floors (Adversarial Fraud Signals)
# ---------------------------------------------------------------------------
_CRAFT_ECONOMICS_FLOORS: list[dict[str, Any]] = [
    {
        "keywords": ("kani",),
        "label": "Handwoven Kani Pashmina",
        "min_plausible_price_inr": 12000,
        "max_plausible_single_workshop_stock": 18,
        "min_plausible_days": 25,
        "required_evidence": ["LOOM_VIDEO_FRAME", "GI_CERTIFICATE", "WORKSHOP_PHOTO"],
    },
    {
        "keywords": ("pashmina", "changthangi", "cashmere"),
        "label": "Handspun Kashmiri Pashmina",
        "min_plausible_price_inr": 6500,
        "max_plausible_single_workshop_stock": 40,
        "min_plausible_days": 14,
        "required_evidence": ["LAB_REPORT", "GI_CERTIFICATE", "WORKSHOP_PHOTO"],
    },
    {
        "keywords": ("sozni",),
        "label": "Hand-Embroidered Sozni",
        "min_plausible_price_inr": 5000,
        "max_plausible_single_workshop_stock": 35,
        "min_plausible_days": 15,
        "required_evidence": ["WORKSHOP_PHOTO", "GI_CERTIFICATE"],
    },
    {
        "keywords": ("hand-knotted", "carpet", "kaleen"),
        "label": "Hand-Knotted Kashmiri Carpet",
        "min_plausible_price_inr": 14000,
        "max_plausible_single_workshop_stock": 15,
        "min_plausible_days": 35,
        "required_evidence": ["WORKSHOP_PHOTO", "GI_CERTIFICATE"],
    },
    {
        "keywords": ("walnut",),
        "label": "Hand-Carved Kashmiri Walnut Wood",
        "min_plausible_price_inr": 1200,
        "max_plausible_single_workshop_stock": 80,
        "min_plausible_days": 3,
        "required_evidence": ["WORKSHOP_PHOTO", "GI_CERTIFICATE"],
    },
]

_GUILD_MAP: list[tuple[tuple[str, ...], str, str]] = [
    (("kani",), "kani-shawls", "Kani Shawls"),
    (("pashmina", "sozni", "shawl", "cashmere", "wool", "stole"), "pashmina", "Pashmina & Shawls"),
    (("walnut", "wood", "khatamband", "box", "carv"), "walnut-wood", "Walnut Wood Carving"),
    (("carpet", "kaleen", "rug", "knot"), "kashmiri-carpets", "Kashmiri Carpets"),
    (("papier", "mache", "naqqashi"), "papier-mache", "Papier-Mâché"),
    (("copper", "samovar", "tram", "brass"), "copperware", "Kashmiri Copperware"),
    (("saffron", "kesar", "mongra", "pampore"), "saffron-pampore", "Pampore Saffron"),
    (("crewel", "chain stitch", "namda", "embroid"), "crewel-embroidery", "Crewel & Embroidery"),
]

_JK_DISTRICTS = (
    "Srinagar",
    "Budgam",
    "Anantnag",
    "Baramulla",
    "Pulwama",
    "Pampore",
    "Ganderbal",
    "Bandipora",
    "Kupwara",
    "Shopian",
    "Kulgam",
    "Jammu",
    "Kishtwar",
    "Doda",
    "Kathua",
    "Leh",
    "Kargil",
)

_OVERCLAIM_RE = re.compile(
    r"\b(?:100%\s*(?:authentic|genuine|pure|verified|certified)|guaranteed\s+(?:authentic|genuine|gi)|officially\s+certified\s+authentic)\b",
    re.IGNORECASE,
)


def _detect_guild(text: str) -> tuple[str, str]:
    low = (text or "").lower()
    for keys, slug, label in _GUILD_MAP:
        if any(k in low for k in keys):
            return slug, label
    return "pashmina", "Kashmiri Heritage Craft"


def _detect_district(text: str, fallback: str | None = None) -> str | None:
    for d in _JK_DISTRICTS:
        if re.search(rf"\b{re.escape(d)}\b", text or "", re.IGNORECASE):
            return d
    return fallback


# ===========================================================================
# PILLAR 1A — Artisan GI Certificate / ID Card Pre-Screen (Verify Page + Admin)
# ===========================================================================
def prescreen_artisan_document(
    db: Session,
    *,
    settings: Settings,
    payload: ArtisanDocPreScreenIn,
    actor_user_id: str | None = None,
) -> dict[str, Any]:
    """Extract PDF/image document signals, cross-check against form + GI registry, and run advisory AI."""
    scan: FileSecurityScan | None = None
    file_path = None
    if payload.file_scan_id:
        scan = db.scalar(select(FileSecurityScan).where(FileSecurityScan.id == payload.file_scan_id))
        if scan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Uploaded document scan record not found.",
            )
        if actor_user_id and scan.uploader_user_id != actor_user_id:
            # Allow Admins as well, caller checks ownership for sellers
            pass
        candidate = settings.private_storage_path / scan.storage_key
        if candidate.exists():
            file_path = candidate

    doc_signals = extract_document_signals(
        file_path=file_path,
        detected_mime_type=scan.detected_mime_type if scan else "text/plain",
        original_filename=scan.original_filename if scan else "manual_submission",
        declared_text_hint=payload.document_text_snippet,
    )

    contradictions: list[str] = []
    checks_passed: list[str] = []
    reviewer_checklist: list[str] = []

    if scan is not None:
        checks_passed.append(
            f"Uploaded file `{scan.original_filename}` verified via magic-byte inspection ({scan.detected_mime_type}) & SHA-256 `{scan.sha256_hash[:12]}…`."
        )

    # Cross-check GI Registry table in MySQL
    gi_ref_match = None
    claimed_gi = (payload.claimed_gi_code or "").strip()
    if payload.verification_path == "GI":
        if not claimed_gi:
            contradictions.append(
                "GI Verification path selected, but no GI Authorized User registration code was provided."
            )
            reviewer_checklist.append("Confirm whether artisan holds an active GI Authorized User number.")
        else:
            gi_ref_match = db.scalar(
                select(GIReferenceRecord).where(
                    GIReferenceRecord.gi_registration_number.ilike(f"%{claimed_gi}%"),
                    GIReferenceRecord.is_active == True,  # noqa: E712
                )
            )
            if gi_ref_match is not None:
                checks_passed.append(
                    f"GI reference record matched in local registry: {gi_ref_match.gi_name} ({gi_ref_match.authorized_geographic_area})."
                )
            else:
                reviewer_checklist.append(
                    f"Manually cross-check GI code `{claimed_gi}` against the official Craft Development Institute / IP India GI Registry."
                )

            if doc_signals["text_char_count"] > 20 and claimed_gi.upper() not in doc_signals["extracted_text_preview"].upper():
                contradictions.append(
                    f"Typed GI code `{claimed_gi}` was not detected verbatim in extracted document text."
                )

    # Cross-check workshop district vs document text
    detected_districts = doc_signals["detected_districts"]
    if detected_districts:
        if any(d.lower() == payload.workshop_district.strip().lower() for d in detected_districts):
            checks_passed.append(
                f"Workshop district `{payload.workshop_district}` matches location found in document."
            )
        else:
            contradictions.append(
                f"Form district is `{payload.workshop_district}`, whereas document mentions {', '.join(detected_districts)}."
            )
            reviewer_checklist.append(
                f"Ask artisan to clarify district discrepancy ({payload.workshop_district} vs {', '.join(detected_districts)})."
            )
    else:
        reviewer_checklist.append(
            f"Visually confirm workshop address/district (`{payload.workshop_district}`) on uploaded document."
        )

    # Cross-check craft specialty
    craft_low = payload.craft_specialty.lower()
    if doc_signals["detected_craft_keywords"]:
        if any(kw in craft_low for kw in doc_signals["detected_craft_keywords"]):
            checks_passed.append(
                f"Craft specialty `{payload.craft_specialty}` aligns with keywords in document ({', '.join(doc_signals['detected_craft_keywords'])})."
            )
        else:
            contradictions.append(
                f"Declared craft `{payload.craft_specialty}` differs from document craft terms ({', '.join(doc_signals['detected_craft_keywords'])})."
            )
    else:
        reviewer_checklist.append(
            f"Visually confirm craft guild (`{payload.craft_specialty}`) and artisan photo/seal on document."
        )

    if doc_signals["text_char_count"] == 0 and scan is not None:
        reviewer_checklist.append(
            "Uploaded file had no embedded selectable text; human Admin must visually inspect the image/PDF before approval."
        )

    # Ask Local Ollama (or configured provider) for concise structured reviewer advisory
    gateway = LocalAIGateway(settings)
    llm_schema = {
        "type": "object",
        "properties": {
            "advisory_summary": {"type": "string"},
            "additional_flags": {"type": "array", "items": {"type": "string"}},
            "suggested_admin_questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["advisory_summary", "additional_flags", "suggested_admin_questions"],
    }
    llm_res = gateway.generate_json(
        system_prompt=(
            "You are HunarLink's Skeptical Pre-Screen Advisor for Kashmiri artisan onboarding documents. "
            "You NEVER approve or legally verify an artisan. Summarize consistency checks objectively "
            "and list concrete human-admin verification steps strictly from the provided JSON. "
            "Do NOT invent GI numbers, authorities, or facts not present in the input."
        ),
        user_prompt=json.dumps(
            {
                "form_submission": {
                    "store_name": payload.store_name,
                    "craft_specialty": payload.craft_specialty,
                    "workshop_district": payload.workshop_district,
                    "verification_path": payload.verification_path,
                    "claimed_gi_code": claimed_gi or None,
                },
                "deterministic_document_signals": doc_signals,
                "deterministic_checks_passed": checks_passed,
                "deterministic_contradictions": contradictions,
            },
            ensure_ascii=False,
        ),
        json_schema=llm_schema,
        temperature=0.1,
    )

    advisory_summary = (
        "Pre-screen completed: potential discrepancies detected for Human Admin review."
        if contradictions
        else "Document integrity & submitted metadata are consistent for Human Admin review."
    )
    if llm_res.ok and llm_res.parsed_json:
        advisory_summary = str(llm_res.parsed_json.get("advisory_summary") or advisory_summary)[:600]
        for flag in llm_res.parsed_json.get("additional_flags") or []:
            if isinstance(flag, str) and flag.strip() and flag.strip() not in contradictions:
                contradictions.append(flag.strip()[:240])
        for q in llm_res.parsed_json.get("suggested_admin_questions") or []:
            if isinstance(q, str) and q.strip() and q.strip() not in reviewer_checklist:
                reviewer_checklist.append(q.strip()[:240])

    if contradictions:
        advisory_status = "MISMATCH_DETECTED"
    elif doc_signals["text_char_count"] == 0 and scan is not None:
        advisory_status = "NEEDS_HUMAN_VISUAL_INSPECTION"
    else:
        advisory_status = "CONSISTENT_FOR_HUMAN_REVIEW"

    dossier = {
        "advisory_status": advisory_status,
        "is_legal_proof": False,
        "human_verification_required": True,
        "advisory_summary": advisory_summary,
        "checks_passed": checks_passed,
        "contradictions": contradictions,
        "reviewer_checklist": reviewer_checklist or ["Verify artisan identity card & craft samples manually."],
        "document_signals": {
            "extraction_method": doc_signals["extraction_method"],
            "text_char_count": doc_signals["text_char_count"],
            "detected_gi_codes": doc_signals["detected_gi_codes"],
            "detected_districts": doc_signals["detected_districts"],
            "detected_craft_keywords": doc_signals["detected_craft_keywords"],
            "notes": doc_signals["notes"],
            "sha256_hash": scan.sha256_hash if scan else None,
            "original_filename": scan.original_filename if scan else None,
        },
        "gi_registry_local_match": (
            {
                "gi_registration_number": gi_ref_match.gi_registration_number,
                "gi_name": gi_ref_match.gi_name,
                "authorized_geographic_area": gi_ref_match.authorized_geographic_area,
            }
            if gi_ref_match is not None
            else None
        ),
        "ai_meta": {
            "provider_used": llm_res.provider_used,
            "model_used": llm_res.model_used,
            "latency_ms": llm_res.latency_ms,
        },
    }

    # Optionally persist the advisory onto the staged SellerVerificationApplication so Admin sees it immediately
    if payload.application_id:
        app_row = db.scalar(
            select(SellerVerificationApplication).where(
                SellerVerificationApplication.id == payload.application_id
            )
        )
        if app_row is not None:
            meta = dict(app_row.submitted_metadata or {})
            meta["ai_prescreen"] = dossier
            app_row.submitted_metadata = meta
            db.commit()

    return dossier


# ===========================================================================
# PILLAR 1B — Adversarial CraftProof Claim & Craft-Economics Auditor
# ===========================================================================
def audit_craft_listing(
    db: Session,
    *,
    settings: Settings,
    payload: CraftAuditListingIn,
    seller_profile: SellerProfile | None = None,
) -> dict[str, Any]:
    """Interrogate craft listing claims for economic/profile/GI contradictions; NEVER self-verifies."""
    combined = " ".join(
        part
        for part in (
            payload.title,
            payload.description or "",
            payload.craft_technique or "",
            payload.material_composition or "",
        )
        if part
    )
    low = combined.lower()

    red_flags: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    required_evidence: set[str] = {"WORKSHOP_PHOTO"}

    # 1. Deterministic craft-economics plausibility checks
    matched_rule = None
    for rule in _CRAFT_ECONOMICS_FLOORS:
        if any(kw in low for kw in rule["keywords"]):
            matched_rule = rule
            required_evidence.update(rule["required_evidence"])
            if payload.selling_price_inr < rule["min_plausible_price_inr"]:
                red_flags.append(
                    {
                        "code": "IMPLAUSIBLE_HANDMADE_PRICE",
                        "severity": "HIGH",
                        "message": (
                            f"Price INR {payload.selling_price_inr:,.0f} is below the plausible handmade floor "
                            f"(INR {rule['min_plausible_price_inr']:,}) for {rule['label']}. "
                            "Power-loom or blended imitation risk — requires raw material & loom proof."
                        ),
                    }
                )
            if payload.stock_quantity > rule["max_plausible_single_workshop_stock"]:
                red_flags.append(
                    {
                        "code": "FACTORY_VOLUME_STOCK_ANOMALY",
                        "severity": "HIGH",
                        "message": (
                            f"Ready stock of {payload.stock_quantity} units exceeds typical single-atelier capacity "
                            f"(<= {rule['max_plausible_single_workshop_stock']}) for {rule['label']}."
                        ),
                    }
                )
            if payload.craft_days_claimed and payload.craft_days_claimed >= rule["min_plausible_days"]:
                implied_daily = payload.selling_price_inr / max(payload.craft_days_claimed, 1)
                if implied_daily < 140:
                    red_flags.append(
                        {
                            "code": "LABOR_ECONOMICS_CONTRADICTION",
                            "severity": "HIGH",
                            "message": (
                                f"Claiming {payload.craft_days_claimed} handmade days at INR {payload.selling_price_inr:,.0f} "
                                f"implies only INR {implied_daily:,.0f}/day (including raw material), which is economically inconsistent with genuine handcraft."
                            ),
                        }
                    )
            break

    # 2. Seller profile vs. listing GI / district contradiction checks
    effective_path = payload.seller_verification_path or (
        seller_profile.verification_path if seller_profile else None
    )
    effective_district = payload.seller_workshop_district or (
        seller_profile.workshop_district if seller_profile else None
    )
    claims_gi_in_text = bool(
        payload.claimed_gi_code or re.search(r"\bgi[\s-]*(?:tag|certified|registered)\b", low)
    )
    if claims_gi_in_text:
        required_evidence.add("GI_CERTIFICATE")
        if effective_path == "NON_GI":
            red_flags.append(
                {
                    "code": "GI_CLAIM_BY_NON_GI_PROFILE",
                    "severity": "HIGH",
                    "message": (
                        "Listing claims GI certification, but the artisan's verified profile is registered on the NON_GI standard craft path."
                    ),
                }
            )
        if not payload.claimed_gi_code:
            warnings.append(
                {
                    "code": "UNSUBSTANTIATED_GI_PHRASE",
                    "severity": "MEDIUM",
                    "message": "Listing text mentions GI certification without a GI Authorized User registration code.",
                }
            )

    if (
        effective_district
        and payload.origin_district
        and effective_district.strip().lower() != payload.origin_district.strip().lower()
    ):
        warnings.append(
            {
                "code": "ORIGIN_DISTRICT_MISMATCH",
                "severity": "MEDIUM",
                "message": (
                    f"Listing origin (`{payload.origin_district}`) differs from artisan's registered workshop district (`{effective_district}`)."
                ),
            }
        )

    # 3. Absolute/superlative authenticity wording check
    if re.search(r"\b(100%\s*pure|guaranteed\s*genuine|certified\s*authentic)\b", low):
        warnings.append(
            {
                "code": "UNVERIFIED_ABSOLUTE_CLAIM",
                "severity": "MEDIUM",
                "message": (
                    "Absolute purity/authenticity phrasing detected. HunarLink will label this claim as SELLER_DECLARED until lab or human proof is verified."
                ),
            }
        )

    # 4. Decompose into atomic claims
    decomposed_claims = [
        {
            "claim_type": "MATERIAL",
            "claim_title": "Material Composition",
            "claim_value": payload.material_composition or "Not explicitly specified",
            "initial_status": "SELLER_DECLARED",
        },
        {
            "claim_type": "ORIGIN",
            "claim_title": "Craft Origin District",
            "claim_value": payload.origin_district or effective_district or "Not explicitly specified",
            "initial_status": "SELLER_DECLARED",
        },
        {
            "claim_type": "TECHNIQUE",
            "claim_title": "Craft Technique",
            "claim_value": payload.craft_technique or "Traditional Handcraft",
            "initial_status": "SELLER_DECLARED",
        },
    ]
    if payload.claimed_gi_code:
        decomposed_claims.append(
            {
                "claim_type": "GI_TAG",
                "claim_title": "GI Registration Code",
                "claim_value": payload.claimed_gi_code,
                "initial_status": "SELLER_DECLARED",
            }
        )

    # 5. Optional Local LLM Adversarial Advisory
    gateway = LocalAIGateway(settings)
    llm_schema = {
        "type": "object",
        "properties": {
            "skeptical_assessment": {"type": "string"},
            "extra_questions_for_reviewer": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["skeptical_assessment", "extra_questions_for_reviewer"],
    }
    llm_res = gateway.generate_json(
        system_prompt=(
            "You are HunarLink's Adversarial CraftProof Auditor. Your job is to critically examine "
            "handmade craft claims for possible exaggeration, machine-made fakes, or missing proof. "
            "NEVER declare a product authentic or verified. Keep answers concise and evidence-focused."
        ),
        user_prompt=json.dumps(
            {
                "listing": payload.model_dump(),
                "deterministic_red_flags": red_flags,
                "deterministic_warnings": warnings,
                "craft_benchmark": matched_rule["label"] if matched_rule else "General Heritage Craft",
            },
            ensure_ascii=False,
        ),
        json_schema=llm_schema,
        temperature=0.1,
    )

    risk_level = "HIGH" if red_flags else ("MEDIUM" if warnings else "LOW")
    skeptical_summary = (
        f"Adversarial Audit flagged {len(red_flags)} high-severity contradiction(s) and {len(warnings)} warning(s). "
        "All claims remain SELLER_DECLARED until human verification of supporting proof."
        if (red_flags or warnings)
        else "No craft-economics contradictions detected. All claims start as SELLER_DECLARED until evidence is verified by a human reviewer."
    )
    reviewer_questions = [
        f"Request `{ev}` evidence before promoting any claim to HUMAN_VERIFIED."
        for ev in sorted(required_evidence)
    ]
    if llm_res.ok and llm_res.parsed_json:
        skeptical_summary = str(llm_res.parsed_json.get("skeptical_assessment") or skeptical_summary)[:600]
        for q in llm_res.parsed_json.get("extra_questions_for_reviewer") or []:
            if isinstance(q, str) and q.strip() and q.strip() not in reviewer_questions:
                reviewer_questions.append(q.strip()[:240])

    # Record an AI_ADVISORY timeline event if linked to a passport (hard DB check guarantees is_legal_proof=False)
    if payload.passport_id:
        cp = db.scalar(select(CraftPassport).where(CraftPassport.id == payload.passport_id))
        if cp is not None:
            db.add(
                CraftVerificationEvent(
                    passport_id=cp.id,
                    claim_id=None,
                    event_type="AI_ADVISORY_RUN",
                    from_status=cp.overall_trust_level,
                    to_status=cp.overall_trust_level,
                    actor_type="AI_ADVISORY",
                    actor_user_id=None,
                    summary=f"Adversarial CraftProof Audit completed (risk={risk_level}, red_flags={len(red_flags)}). Human review required.",
                    metadata_json={
                        "risk_level": risk_level,
                        "red_flags": red_flags,
                        "warnings": warnings,
                        "provider": llm_res.provider_used,
                    },
                    is_legal_proof=False,
                )
            )
            db.commit()

    return {
        "risk_level": risk_level,
        "is_legal_proof": False,
        "human_verification_required": True,
        "skeptical_assessment": skeptical_summary,
        "red_flags": red_flags,
        "warnings": warnings,
        "decomposed_claims": decomposed_claims,
        "prescribed_evidence_types": sorted(required_evidence),
        "reviewer_questions": reviewer_questions,
        "fair_craft_preview": build_fair_craft_breakdown(
            selling_price_inr=payload.selling_price_inr,
            craft_text=combined,
            craft_days=payload.craft_days_claimed,
            origin_location=payload.origin_district or effective_district,
        ),
        "ai_meta": {
            "provider_used": llm_res.provider_used,
            "model_used": llm_res.model_used,
            "latency_ms": llm_res.latency_ms,
        },
    }


# ===========================================================================
# PILLAR 2 — Vernacular Voice-to-Passport Artisan Copilot (Zero Hallucination)
# ===========================================================================
def _deterministic_parse_artisan_note(payload: ArtisanCopilotDraftIn) -> dict[str, Any]:
    raw = payload.raw_note.strip()
    low = raw.lower()
    guild_slug, guild_label = _detect_guild(raw + " " + (payload.seller_craft_specialty or ""))
    district = _detect_district(raw, fallback=payload.seller_district)

    # Extract price (handles ₹14500, 14,500 rupaye, rs 18000, price 16500)
    price = None
    m_price = re.search(
        r"(?:₹|rs\.?|inr|price|rate|kimat|daam)?\s*(\d{1,3}(?:,\d{3})+|\d{3,6})\s*(?:rupaye|rupees|rs|inr|/-)?",
        low,
    )
    if m_price:
        val = int(m_price.group(1).replace(",", ""))
        if 150 <= val <= 2000000:
            price = val

    # Extract stock / pieces (e.g. "5 pieces", "3 piece ready", "4 pcs")
    stock = None
    m_stock = re.search(r"\b(\d{1,4})\s*(?:piece|pieces|pcs|units?|shawl|shawls|box|boxes|ready)\b", low)
    if m_stock:
        stock = int(m_stock.group(1))

    # Extract craft days / months (e.g. "45 din", "3 mahine", "2 months", "60 days")
    craft_days = None
    m_months = re.search(r"\b(\d{1,2})\s*(?:mahine|mahina|month|months)\b", low)
    m_days = re.search(r"\b(\d{1,3})\s*(?:din|day|days)\b", low)
    if m_months:
        craft_days = int(m_months.group(1)) * 30
    elif m_days:
        craft_days = int(m_days.group(1))

    # Extract GI code ONLY if present verbatim
    m_gi = re.search(r"\bGI[-/\s]?(?:JK|IN)?[-/\s]?[A-Z0-9-]{3,20}\b", raw, re.IGNORECASE)
    gi_code = m_gi.group(0).upper().strip() if m_gi else None

    # Extract material only if explicitly mentioned
    material_parts = []
    for kw, label in (
        ("pashmina", "Pashmina Wool"),
        ("cashmere", "Cashmere Wool"),
        ("wool", "Natural Wool"),
        ("silk", "Mulberry Silk"),
        ("walnut", "Seasoned Kashmiri Walnut Wood"),
        ("copper", "Hand-Beaten Copper"),
        ("paper pulp", "Hand-Molded Paper Pulp"),
        ("saffron", "Pampore Mongra Saffron"),
        ("cotton", "Cotton"),
    ):
        if kw in low and label not in material_parts:
            material_parts.append(label)
    material = ", ".join(material_parts) if material_parts else None

    technique_parts = []
    for kw, label in (
        ("kani", "Handwoven Kani Twill Tapestry"),
        ("sozni", "Fine Hand Sozni Needle Embroidery"),
        ("handloom", "Traditional Kashmiri Handloom"),
        ("handwoven", "Traditional Handwoven Loom"),
        ("haath", "Handcrafted Artisan Work"),
        ("carv", "Hand-Chiseled Carving"),
        ("knot", "Hand-Knotted Farsi Baf"),
        ("naqqashi", "Hand-Painted Naqqashi"),
    ):
        if kw in low and label not in technique_parts:
            technique_parts.append(label)
    technique = ", ".join(technique_parts) if technique_parts else None

    title_bits = [bit for bit in (district, guild_label) if bit]
    title = f"Handcrafted {' '.join(title_bits)}" if title_bits else f"Handcrafted {guild_label}"

    return {
        "title": title,
        "guild_slug": guild_slug,
        "guild_label": guild_label,
        "craft_technique": technique,
        "origin_district": district,
        "material_composition": material,
        "craft_days_estimated": craft_days,
        "selling_price_inr": price,
        "stock_quantity": stock,
        "claimed_gi_code": gi_code,
        "clean_description": (
            f"{title}. Crafted by artisan workshop"
            + (f" in {district}" if district else "")
            + (f" using {material}" if material else "")
            + (f" over approximately {craft_days} work-days" if craft_days else "")
            + ". Every detail below reflects the artisan's declaration and will display as SELLER_DECLARED until evidence is verified."
        ),
    }


def draft_artisan_listing(
    *,
    settings: Settings,
    payload: ArtisanCopilotDraftIn,
) -> dict[str, Any]:
    """Turn unstructured Hindi/Hinglish/English artisan speech/notes into a structured editable listing.

    Hard anti-hallucination guarantees:
      - Missing specs MUST remain `null` and appear in `missing_fields_to_confirm`.
      - Any GI code returned by LLM MUST appear verbatim in `raw_note` or is deterministically stripped.
      - All extracted claims are strictly tagged `SELLER_DECLARED`.
    """
    baseline = _deterministic_parse_artisan_note(payload)
    gateway = LocalAIGateway(settings)

    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "craft_technique": {"type": ["string", "null"]},
            "origin_district": {"type": ["string", "null"]},
            "material_composition": {"type": ["string", "null"]},
            "craft_days_estimated": {"type": ["integer", "null"]},
            "selling_price_inr": {"type": ["number", "null"]},
            "stock_quantity": {"type": ["integer", "null"]},
            "claimed_gi_code": {"type": ["string", "null"]},
            "clean_description": {"type": "string"},
            "missing_fields_to_confirm": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "title",
            "craft_technique",
            "origin_district",
            "material_composition",
            "craft_days_estimated",
            "selling_price_inr",
            "stock_quantity",
            "claimed_gi_code",
            "clean_description",
            "missing_fields_to_confirm",
        ],
    }

    llm_res = gateway.generate_json(
        system_prompt=(
            "You are HunarLink's Vernacular Artisan Copilot helping Kashmiri & Indian artisans "
            "(speaking English, Hindi, or Hinglish) structure a craft listing. "
            "STRICT RULES:\n"
            "1. Extract ONLY facts explicitly stated in the artisan's note.\n"
            "2. NEVER invent GI codes, micron counts, pure cashmere/silk claims, prices, or days not stated.\n"
            "3. Set any unmentioned field to null and list it in `missing_fields_to_confirm`.\n"
            "4. Write `clean_description` in warm, accurate English without exaggerated authenticity guarantees."
        ),
        user_prompt=json.dumps(
            {
                "artisan_note": payload.raw_note,
                "known_seller_district": payload.seller_district,
                "known_seller_craft": payload.seller_craft_specialty,
            },
            ensure_ascii=False,
        ),
        json_schema=schema,
        temperature=0.1,
    )

    draft = dict(baseline)
    llm_missing: list[str] = []
    if llm_res.ok and llm_res.parsed_json:
        p = llm_res.parsed_json
        if isinstance(p.get("title"), str) and len(p["title"].strip()) >= 4:
            draft["title"] = p["title"].strip()[:180]
        if isinstance(p.get("clean_description"), str) and len(p["clean_description"].strip()) >= 12:
            draft["clean_description"] = p["clean_description"].strip()[:1500]
        for key in ("craft_technique", "origin_district", "material_composition"):
            if isinstance(p.get(key), str) and p[key].strip():
                draft[key] = p[key].strip()[:200]
        for num_key in ("craft_days_estimated", "selling_price_inr", "stock_quantity"):
            val = p.get(num_key)
            if isinstance(val, (int, float)) and val > 0:
                draft[num_key] = int(round(val))
        if isinstance(p.get("claimed_gi_code"), str) and p["claimed_gi_code"].strip():
            draft["claimed_gi_code"] = p["claimed_gi_code"].strip()
        if isinstance(p.get("missing_fields_to_confirm"), list):
            llm_missing = [str(x).strip() for x in p["missing_fields_to_confirm"] if str(x).strip()]

    # HARD ANTI-HALLUCINATION GUARD: Strip any GI code not present verbatim in artisan's raw note
    raw_compact = re.sub(r"\s+", "", payload.raw_note).upper()
    if draft.get("claimed_gi_code"):
        gi_compact = re.sub(r"\s+", "", str(draft["claimed_gi_code"])).upper()
        if gi_compact not in raw_compact:
            draft["claimed_gi_code"] = None

    guild_slug, guild_label = _detect_guild(
        f"{draft.get('title', '')} {draft.get('craft_technique') or ''} {payload.raw_note}"
    )
    draft["guild_slug"] = guild_slug
    draft["guild_label"] = guild_label

    # Compute missing fields transparently
    missing: list[str] = []
    field_labels = [
        ("claimed_gi_code", "GI Registration Code (not mentioned — leave blank unless GI registered)"),
        ("material_composition", "Exact Material / Fiber Composition (e.g., wool blend vs Changthangi cashmere)"),
        ("craft_days_estimated", "Artisan Work-Days / Loom Hours"),
        ("selling_price_inr", "Direct Artisan Selling Price (INR)"),
        ("stock_quantity", "Ready Stock Quantity"),
        ("origin_district", "Workshop Origin District"),
    ]
    for key, label in field_labels:
        if not draft.get(key):
            missing.append(label)
    for extra in llm_missing:
        if len(missing) < 8 and not any(extra.lower() in m.lower() for m in missing):
            missing.append(extra)

    # Separated Seller-Declared Claims (never verified!)
    extracted_claims: list[dict[str, str]] = []
    if draft.get("material_composition"):
        extracted_claims.append(
            {
                "claim_type": "MATERIAL",
                "claim_title": "Declared Material",
                "claim_value": str(draft["material_composition"]),
                "status": "SELLER_DECLARED",
                "recommended_evidence": "RAW MATERIAL INVOICE or LAB_REPORT",
            }
        )
    if draft.get("origin_district"):
        extracted_claims.append(
            {
                "claim_type": "ORIGIN",
                "claim_title": "Workshop Origin",
                "claim_value": str(draft["origin_district"]),
                "status": "SELLER_DECLARED",
                "recommended_evidence": "ARTISAN_CARD or WORKSHOP_PHOTO",
            }
        )
    if draft.get("craft_technique"):
        extracted_claims.append(
            {
                "claim_type": "TECHNIQUE",
                "claim_title": "Craft Technique",
                "claim_value": str(draft["craft_technique"]),
                "status": "SELLER_DECLARED",
                "recommended_evidence": "WORKSHOP_PHOTO or LOOM_VIDEO_FRAME",
            }
        )
    if draft.get("craft_days_estimated"):
        extracted_claims.append(
            {
                "claim_type": "HANDMADE",
                "claim_title": "Estimated Craft Effort",
                "claim_value": f"Approx. {draft['craft_days_estimated']} artisan work-days",
                "status": "SELLER_DECLARED",
                "recommended_evidence": "WORKSHOP_PHOTO",
            }
        )
    if draft.get("claimed_gi_code"):
        extracted_claims.append(
            {
                "claim_type": "GI_TAG",
                "claim_title": "GI Authorized User Code",
                "claim_value": str(draft["claimed_gi_code"]),
                "status": "SELLER_DECLARED",
                "recommended_evidence": "GI_CERTIFICATE",
            }
        )

    fair_craft = None
    if draft.get("selling_price_inr"):
        fair_craft = build_fair_craft_breakdown(
            selling_price_inr=float(draft["selling_price_inr"]),
            craft_text=f"{draft['title']} {draft.get('craft_technique') or ''} {draft.get('material_composition') or ''}",
            craft_days=draft.get("craft_days_estimated"),
            origin_location=draft.get("origin_district"),
        )

    return {
        "draft": draft,
        "extracted_claims": extracted_claims,
        "missing_fields_to_confirm": missing,
        "fair_craft_breakdown": fair_craft,
        "anti_hallucination_notice": (
            "Fields not mentioned in your voice/text note were intentionally left blank "
            "and every claim starts as SELLER_DECLARED until human verification."
        ),
        "ai_meta": {
            "provider_used": llm_res.provider_used,
            "model_used": llm_res.model_used,
            "latency_ms": llm_res.latency_ms,
        },
    }


# ===========================================================================
# PILLAR 3 — Refuses-to-Lie Evidence-Locked Buyer Assistant
# ===========================================================================
def _build_deterministic_buyer_answer(passport_data: dict[str, Any], question: str) -> str:
    prod = passport_data["product"]
    artisan = passport_data["artisan"]
    verified = passport_data["verified_claims"]
    unverified = passport_data["unverified_claims"]
    fair = passport_data.get("fair_craft_breakdown") or {}
    q_low = question.lower()

    lines: list[str] = []
    if any(w in q_low for w in ("authentic", "real", "pure", "genuine", "gi", "verif", "fake", "proof", "lab")):
        if verified:
            v_str = "; ".join(
                f"{c['claim_title']}: '{c['claim_value']}' ({c['verification_status']}"
                + (f" by {c['verified_by_authority']}" if c.get("verified_by_authority") else "")
                + ")"
                for c in verified
            )
            lines.append(f"Independently Verified on this Craft Passport: {v_str}.")
        else:
            lines.append(
                f"Honest Trust Notice: '{prod['name']}' currently has ZERO independently verified claims "
                f"(Overall status: {passport_data['overall_trust_level']}). HunarLink cannot independently confirm authenticity or GI status yet."
            )
        if unverified:
            u_str = "; ".join(
                f"{c['claim_title']}: '{c['claim_value']}' [{c['verification_status']}]"
                for c in unverified
            )
            lines.append(f"Artisan Declarations (NOT yet independently verified): {u_str}.")
    elif any(w in q_low for w in ("price", "cost", "expensive", "worth", "fair", "why")):
        lines.append(
            fair.get("fairness_summary")
            or f"Listed at INR {prod.get('selling_price_inr') or 0:,.0f} directly from {artisan.get('store_name')}."
        )
        lines.append(
            f"Note: Craft effort and material details currently reflect status {passport_data['overall_trust_level']} on the Craft Passport."
        )
    elif any(w in q_low for w in ("check", "inspect", "test", "arrive", "home", "tell")):
        checks = fair.get("physical_inspection_guide") or []
        lines.append("Physical Authenticity Checks when your parcel arrives:")
        for idx, chk in enumerate(checks[:3], 1):
            lines.append(f"{idx}. {chk}")
    else:
        lines.append(
            f"Craft Passport {passport_data['passport_code']} for '{prod['name']}' by {artisan.get('store_name')} "
            f"({artisan.get('workshop_district') or prod.get('origin_location')})."
        )
        lines.append(
            f"Trust Summary: {len(verified)} verified claim(s), {len(unverified)} unverified/seller-declared claim(s) "
            f"(Overall: {passport_data['overall_trust_level']})."
        )
        if prod.get("materials_summary"):
            lines.append(f"Materials recorded: {prod['materials_summary']}.")
        if prod.get("manufacturing_process"):
            lines.append(f"Technique recorded: {prod['manufacturing_process']}.")

    return "\n\n".join(lines)


def answer_buyer_passport_question(
    db: Session,
    *,
    settings: Settings,
    payload: BuyerAssistantAskIn,
) -> dict[str, Any]:
    """Answer buyer questions strictly grounded in live MySQL Craft Passport claims & evidence."""
    passport = None
    if payload.passport_code:
        passport = resolve_passport_by_code_or_slug(db, payload.passport_code)
    elif payload.product_ref:
        passport = resolve_or_create_passport_by_product(db, payload.product_ref)

    if passport is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Craft Passport not found for this product. Provide a valid `passport_code` or `product_ref`.",
        )

    passport_data = serialize_passport_public(db, passport, api_prefix=settings.api_v1_prefix)
    verified = passport_data["verified_claims"]
    unverified = passport_data["unverified_claims"]

    # Build tight factual context bundle (zero ungrounded marketing fluff)
    context_bundle = {
        "passport_code": passport_data["passport_code"],
        "overall_trust_level": passport_data["overall_trust_level"],
        "product": passport_data["product"],
        "artisan": {
            "store_name": passport_data["artisan"]["store_name"],
            "workshop_district": passport_data["artisan"]["workshop_district"],
            "verification_path": passport_data["artisan"]["verification_path"],
            "verification_status": passport_data["artisan"]["verification_status"],
        },
        "verified_claims": [
            {
                "claim": c["claim_title"],
                "value": c["claim_value"],
                "status": c["verification_status"],
                "authority": c["verified_by_authority"],
                "evidence_count": len(c["evidence"]),
            }
            for c in verified
        ],
        "unverified_or_seller_declared_claims": [
            {
                "claim": c["claim_title"],
                "value": c["claim_value"],
                "status": c["verification_status"],
                "evidence_count": len(c["evidence"]),
            }
            for c in unverified
        ],
        "fair_craft_breakdown": passport_data["fair_craft_breakdown"],
        "recent_verification_events": passport_data["verification_timeline"][:5],
    }

    gateway = LocalAIGateway(settings)
    llm_res = gateway.generate_text(
        system_prompt=(
            "You are HunarLink's Evidence-Locked CraftProof Buyer Assistant. "
            "STRICT TRUST RULES:\n"
            "1. Answer ONLY using the live Craft Passport JSON provided below.\n"
            "2. ALWAYS distinguish Independently Verified claims (`HUMAN_VERIFIED` / `THIRD_PARTY_VERIFIED`) "
            "from unverified Artisan Declarations (`SELLER_DECLARED`, `EVIDENCE_SUBMITTED`, `UNDER_REVIEW`, `NOT_ESTABLISHED`, `REJECTED`).\n"
            "3. If a buyer asks whether this item is authentic, pure, or GI-certified and those claims are NOT in `verified_claims`, "
            "you MUST explicitly refuse to confirm authenticity and state the exact current status (e.g., SELLER_DECLARED with no human verification yet).\n"
            "4. If a detail is absent from the JSON, say: 'This detail is not recorded on the product Craft Passport.'\n"
            "5. Keep answers concise, clear, and transparent (under 140 words)."
        ),
        user_prompt=(
            f"LIVE CRAFT PASSPORT DATA:\n{json.dumps(context_bundle, ensure_ascii=False)}\n\n"
            f"BUYER QUESTION: {payload.question}"
        ),
        temperature=0.15,
    )

    answer_text = (
        llm_res.raw_text.strip()
        if (llm_res.ok and llm_res.raw_text)
        else _build_deterministic_buyer_answer(passport_data, payload.question)
    )

    # HARD DETERMINISTIC ANTI-OVERCLAIM GUARDRAIL
    overclaim_guard_triggered = False
    if not verified and _OVERCLAIM_RE.search(answer_text):
        overclaim_guard_triggered = True
        answer_text = _build_deterministic_buyer_answer(passport_data, payload.question)

    return {
        "passport_code": passport_data["passport_code"],
        "overall_trust_level": passport_data["overall_trust_level"],
        "answer": answer_text,
        "verified_claims_count": len(verified),
        "unverified_claims_count": len(unverified),
        "cited_claims": [
            {
                "claim_title": c["claim_title"],
                "claim_value": c["claim_value"],
                "verification_status": c["verification_status"],
                "is_independently_verified": c["is_independently_verified"],
            }
            for c in passport_data["all_claims"]
        ],
        "physical_inspection_guide": (passport_data.get("fair_craft_breakdown") or {}).get(
            "physical_inspection_guide", []
        ),
        "overclaim_guard_triggered": overclaim_guard_triggered,
        "is_legal_proof": False,
        "ai_meta": {
            "provider_used": llm_res.provider_used,
            "model_used": llm_res.model_used,
            "latency_ms": llm_res.latency_ms,
        },
    }
