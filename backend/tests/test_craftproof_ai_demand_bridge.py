"""Automated tests for CraftProof AI Passports, Local AI Guardrails & Demand Bridge Cluster Pooling.

Tests run cleanly in deterministic fallback mode (zero external API calls required)
and enforce all hard trust invariants alongside the 73 existing marketplace tests.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.base import new_uuid
from app.models.core_models import SellerProfile
from app.models.craftproof_models import (
    AIInteractionLog,
    ArtisanCapability,
    CraftVerificationEvent,
)
from tests.conftest import (
    create_user_with_roles,
    seed_marketplace_entities,
    set_authenticated_principal,
)


def test_craft_passport_lifecycle_qr_and_human_only_verification(app_and_client, db_session, test_settings):
    test_settings.ai_provider = "fallback"
    app, client = app_and_client
    env = seed_marketplace_entities(db_session)
    listing = env["active_listing"]

    # 1. Seller creates passport — every claim MUST start SELLER_DECLARED
    set_authenticated_principal(app, env["seller_principal"])
    res = client.post(
        f"/api/v1/seller/passports/for-listing/{listing.id}",
        json={
            "materials_summary": "100% Handspun Changthangi Pashmina",
            "manufacturing_process": "Traditional Kani wooden bobbin twill weave",
            "origin_location": "Budgam, Jammu & Kashmir",
            "craft_days_estimated": 65,
        },
    )
    assert res.status_code == 201, res.text
    passport = res.json()
    passport_code = passport["passport_code"]
    assert passport_code.startswith("HL-CP-")
    assert passport["overall_trust_level"] == "SELLER_DECLARED"
    assert len(passport["verified_claims"]) == 0
    assert len(passport["unverified_claims"]) >= 4
    assert passport["fair_craft_breakdown"]["estimated_craft_days"] == 65

    # 2. Public QR SVG renders without authentication
    set_authenticated_principal(app, None)
    qr_res = client.get(f"/api/v1/passports/{passport_code}/qr.svg")
    assert qr_res.status_code == 200
    assert "image/svg+xml" in qr_res.headers["content-type"]
    assert "<svg" in qr_res.text and "craftproof-qr-svg" in qr_res.text

    # 3. Public lookup finds passport by code
    lookup_res = client.get(f"/api/v1/passports/lookup?q={passport_code}")
    assert lookup_res.status_code == 200
    assert lookup_res.json()["count"] >= 1

    # 4. Buyer Assistant refuses to confirm authenticity while 0 claims are verified
    ask_before = client.post(
        "/api/v1/ai/buyer-assistant/ask",
        json={
            "passport_code": passport_code,
            "question": "Is this 100% authentic lab-verified GI Pashmina?",
        },
    )
    assert ask_before.status_code == 200, ask_before.text
    b_data = ask_before.json()
    assert b_data["verified_claims_count"] == 0
    assert b_data["is_legal_proof"] is False
    assert "ZERO independently verified" in b_data["answer"] or "SELLER_DECLARED" in b_data["answer"]

    # 5. Seller attaches evidence to Material claim -> status becomes EVIDENCE_SUBMITTED
    claim_id = passport["unverified_claims"][0]["claim_id"]
    set_authenticated_principal(app, env["seller_principal"])
    ev_res = client.post(
        f"/api/v1/seller/passports/claims/{claim_id}/evidence",
        json={
            "evidence_type": "WORKSHOP_PHOTO",
            "external_reference_url": "https://example.org/workshop-loom-evidence.jpg",
            "caption": "Handloom weaving frame in Budgam workshop",
        },
    )
    assert ev_res.status_code == 201, ev_res.text
    assert ev_res.json()["verification_status"] == "EVIDENCE_SUBMITTED"

    # 6. Seller MUST be blocked (403) from verifying their own claim!
    forbid_res = client.post(
        f"/api/v1/admin/passports/claims/{claim_id}/decision",
        json={
            "decision_status": "HUMAN_VERIFIED",
            "decision_notes": "Seller trying to self-verify.",
        },
    )
    assert forbid_res.status_code == 403

    # 7. Human Admin verifies the claim -> passport upgrades live & timeline records HUMAN_ADMIN
    set_authenticated_principal(app, env["admin_principal"])
    admin_q = client.get("/api/v1/admin/passports/claims?status_filter=EVIDENCE_SUBMITTED")
    assert admin_q.status_code == 200
    assert any(c["claim_id"] == claim_id for c in admin_q.json()["items"])

    decide_res = client.post(
        f"/api/v1/admin/passports/claims/{claim_id}/decision",
        json={
            "decision_status": "HUMAN_VERIFIED",
            "decision_notes": "Workshop loom photo & raw wool invoice reviewed by HunarLink desk.",
            "verified_by_authority": "HunarLink Kashmir Craft Desk",
        },
    )
    assert decide_res.status_code == 200, decide_res.text
    decided = decide_res.json()
    assert decided["verification_status"] == "HUMAN_VERIFIED"
    assert decided["overall_trust_level"] == "HUMAN_VERIFIED"
    assert len(decided["passport"]["verified_claims"]) == 1

    # 8. Buyer Assistant now cites the live verified claim while keeping other claims unverified
    set_authenticated_principal(app, None)
    ask_after = client.post(
        "/api/v1/ai/buyer-assistant/ask",
        json={
            "passport_code": passport_code,
            "question": "Is this authentic and verified?",
        },
    )
    assert ask_after.status_code == 200
    assert ask_after.json()["verified_claims_count"] == 1
    assert "HUMAN_VERIFIED" in ask_after.json()["answer"]


def test_db_check_constraint_blocks_ai_advisory_from_marking_verified(db_session):
    """Hard SQL CHECK constraint guarantees AI_ADVISORY can never log a verified decision."""
    env = seed_marketplace_entities(db_session)
    from app.modules.craftproof.service import ensure_passport_for_listing

    cp = ensure_passport_for_listing(db_session, listing=env["active_listing"])
    db_session.commit()

    bad_event = CraftVerificationEvent(
        passport_id=cp.id,
        claim_id=None,
        event_type="AI_ADVISORY_RUN",
        from_status="SELLER_DECLARED",
        to_status="HUMAN_VERIFIED",
        actor_type="AI_ADVISORY",
        actor_user_id=None,
        summary="Illegal AI verification attempt",
        is_legal_proof=False,
    )
    db_session.add(bad_event)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_pillar1a_artisan_doc_prescreen_flags_contradictions(app_and_client, db_session, test_settings):
    test_settings.ai_provider = "fallback"
    app, client = app_and_client
    env = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, env["seller_principal"])

    res = client.post(
        "/api/v1/ai/artisan-doc/prescreen",
        json={
            "store_name": "Valley Looms",
            "craft_specialty": "Kashmir Pashmina",
            "workshop_district": "Srinagar",
            "verification_path": "GI",
            "claimed_gi_code": "GI-JK-PASH-9999",
            "document_text_snippet": "Artisan Card issued in Anantnag for Walnut Wood Carving reg AU-1042.",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["is_legal_proof"] is False
    assert data["human_verification_required"] is True
    assert data["advisory_status"] == "MISMATCH_DETECTED"
    assert len(data["contradictions"]) >= 2


def test_pillar1b_adversarial_craft_audit_catches_fake_kani_economics(app_and_client, db_session, test_settings):
    test_settings.ai_provider = "fallback"
    app, client = app_and_client
    env = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, env["seller_principal"])

    res = client.post(
        "/api/v1/ai/craft-audit/listing",
        json={
            "title": "100% Pure GI Certified Handwoven Kani Pashmina Shawl",
            "description": "Guaranteed genuine Kani shawl, 90 days handwork",
            "craft_technique": "Kani Handloom",
            "material_composition": "Pure Pashmina",
            "origin_district": "Srinagar",
            "selling_price_inr": 1550,
            "stock_quantity": 250,
            "craft_days_claimed": 90,
            "seller_verification_path": "NON_GI",
            "seller_workshop_district": "Jammu",
        },
    )
    assert res.status_code == 200, res.text
    audit = res.json()
    assert audit["risk_level"] == "HIGH"
    assert audit["is_legal_proof"] is False
    codes = {f["code"] for f in audit["red_flags"]}
    assert "IMPLAUSIBLE_HANDMADE_PRICE" in codes
    assert "FACTORY_VOLUME_STOCK_ANOMALY" in codes
    assert "GI_CLAIM_BY_NON_GI_PROFILE" in codes


def test_pillar2_hinglish_artisan_copilot_zero_hallucination(app_and_client, test_settings):
    test_settings.ai_provider = "fallback"
    _, client = app_and_client

    res = client.post(
        "/api/v1/ai/artisan-copilot/draft",
        json={
            "raw_note": "Main Budgam se hoon, haath se Sozni shawl banaya hai, 45 din lage, pure wool hai, 14500 rupaye chahiye, 3 piece ready hain.",
        },
    )
    assert res.status_code == 200, res.text
    out = res.json()
    draft = out["draft"]
    assert draft["origin_district"] == "Budgam"
    assert draft["craft_days_estimated"] == 45
    assert draft["selling_price_inr"] == 14500
    assert draft["stock_quantity"] == 3
    # GI code was NOT mentioned -> MUST stay null & flagged in missing fields!
    assert draft["claimed_gi_code"] is None
    assert any("GI" in m for m in out["missing_fields_to_confirm"])
    assert all(c["status"] == "SELLER_DECLARED" for c in out["extracted_claims"])
    assert out["fair_craft_breakdown"]["estimated_craft_days"] == 45


def test_pillar4_demand_bridge_multi_artisan_cluster_pooling(app_and_client, db_session, test_settings):
    test_settings.ai_provider = "fallback"
    app, client = app_and_client
    seed_marketplace_entities(db_session)

    # Seed 3 small walnut wood workshops whose individual capacities (35, 30, 25) cannot solo 85 units
    walnut_sellers = []
    for idx, (name, district, cap_units, price_lo, price_hi) in enumerate(
        [
            ("Anantnag Heritage Walnut Guild", "Anantnag", 35, 2100, 2600),
            ("Chinar Chisel Atelier", "Srinagar", 30, 2200, 2750),
            ("Budgam Master Carvers", "Budgam", 25, 2000, 2500),
        ],
        1,
    ):
        u, p = create_user_with_roles(
            db_session,
            email=f"walnut{idx}@example.com",
            full_name=f"Master Carver {idx}",
            roles=["DIRECT_SELLER"],
        )
        sp = SellerProfile(
            id=new_uuid(),
            user_id=u.id,
            store_name=name,
            store_slug=f"walnut-workshop-{idx}",
            craft_specialty="Walnut Wood Carving",
            workshop_district=district,
            verification_path="GI",
            profile_status="ACTIVE",
            verification_status="APPROVED",
        )
        db_session.add(sp)
        db_session.flush()
        db_session.add(
            ArtisanCapability(
                seller_profile_id=sp.id,
                category_slug="walnut-wood",
                craft_techniques_json=["Walnut Wood Carving"],
                monthly_capacity_units=cap_units,
                min_order_qty=5,
                standard_lead_time_days=20,
                unit_price_min_inr=Decimal(str(price_lo)),
                unit_price_max_inr=Decimal(str(price_hi)),
                supports_custom_design=True,
                accepts_wholesale=True,
                availability_status="AVAILABLE",
            )
        )
        walnut_sellers.append((u, p, sp))
    db_session.commit()

    # Step 1: Parse natural-language bulk brief
    parse_res = client.post(
        "/api/v1/demand-bridge/parse",
        json={
            "raw_request_text": "Need 85 hand-carved walnut jewelry boxes for corporate gifting within 25 days, budget 2000 to 2800 INR per unit, prefer GI verified artisans."
        },
    )
    assert parse_res.status_code == 200, parse_res.text
    parsed = parse_res.json()["structured_requirements"]
    assert parsed["category_slug"] == "walnut-wood"
    assert parsed["requested_quantity"] == 85
    assert parsed["budget_max_inr"] == 2800

    # Step 2: Deterministic Match -> MUST automatically form MULTI_ARTISAN_CLUSTER summing to 85 units!
    match_res = client.post(
        "/api/v1/demand-bridge/match",
        json={
            "raw_request_text": "Need 85 hand-carved walnut jewelry boxes within 25 days, budget 2000-2800 INR",
            "buyer_name": "Taj Corporate Gifting",
            "buyer_email": "sourcing@tajdemo.in",
            "category_slug": "walnut-wood",
            "requested_quantity": 85,
            "budget_min_inr": 2000,
            "budget_max_inr": 2800,
            "target_delivery_days": 25,
            "requires_verified_claims": True,
            "allow_cluster_pooling": True,
        },
    )
    assert match_res.status_code == 201, match_res.text
    mdata = match_res.json()
    assert mdata["fulfillment_mode"] == "MULTI_ARTISAN_CLUSTER"
    cluster = mdata["cluster_plan"]
    assert cluster is not None
    assert cluster["cluster_size"] == 3
    assert cluster["total_allocated_quantity"] == 85
    assert cluster["coverage_pct"] == 100.0

    # Step 3: Dispatch inquiries to the entire cluster
    disp_res = client.post(
        f"/api/v1/demand-bridge/requests/{mdata['demand_request_id']}/dispatch-inquiries",
        json={"buyer_name": "Taj Corporate Gifting", "buyer_email": "sourcing@tajdemo.in"},
    )
    assert disp_res.status_code == 200
    assert disp_res.json()["contacted_count"] == 3

    # Step 4: First walnut artisan logs into Seller Studio and accepts their cluster allocation!
    set_authenticated_principal(app, walnut_sellers[0][1])
    offers_res = client.get("/api/v1/seller/demand-bridge/offers")
    assert offers_res.status_code == 200
    offers = offers_res.json()["items"]
    assert len(offers) == 1
    assert offers[0]["is_cluster_member"] is True
    assert offers[0]["allocated_quantity"] > 0

    accept_res = client.post(
        f"/api/v1/seller/demand-bridge/offers/{offers[0]['match_id']}/respond",
        json={"decision": "ACCEPTED", "response_note": "Workshop ready to carve 35 walnut boxes in 19 days."},
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["match_status"] == "ACCEPTED"


def test_all_ai_workflows_persist_to_ai_interaction_logs_and_enforce_not_legal_proof(
    app_and_client, db_session, test_settings
):
    """Every LLM endpoint logs to `ai_interaction_logs` and SQL CHECK forbids `is_legal_proof=True`."""
    test_settings.ai_provider = "fallback"
    app, client = app_and_client
    env = seed_marketplace_entities(db_session)

    # 1. Trigger Copilot Draft & Demand Bridge Parse
    r1 = client.post(
        "/api/v1/ai/artisan-copilot/draft",
        json={"raw_note": "Srinagar se hand-carved walnut box, 12 din lage, price 2400, 5 pieces."},
    )
    assert r1.status_code == 200
    assert r1.json()["ai_meta"]["interaction_log_id"]

    r2 = client.post(
        "/api/v1/demand-bridge/parse",
        json={"raw_request_text": "Need 40 Kashmiri copper samovars within 20 days under 3500 INR."},
    )
    assert r2.status_code == 200
    assert r2.json()["ai_meta"]["interaction_log_id"]

    # 2. Non-admin cannot read Admin AI audit trail
    set_authenticated_principal(app, env["seller_principal"])
    assert client.get("/api/v1/ai/admin/interaction-logs").status_code == 403

    # 3. Admin reads persisted logs from DB
    set_authenticated_principal(app, env["admin_principal"])
    logs_res = client.get("/api/v1/ai/admin/interaction-logs")
    assert logs_res.status_code == 200
    items = logs_res.json()["items"]
    workflows = {i["workflow_type"] for i in items}
    assert "ARTISAN_COPILOT_DRAFT" in workflows
    assert "DEMAND_BRIDGE_PARSE" in workflows
    assert all(i["is_legal_proof"] is False for i in items)

    # 4. Hard SQL CHECK constraint rejects `is_legal_proof=True`
    bad_log = AIInteractionLog(
        workflow_type="BUYER_ASSISTANT_QA",
        provider_used="ollama",
        model_used="qwen2.5:3b",
        latency_ms=120,
        input_text="Is this pure?",
        output_summary="Yes",
        output_json={},
        is_legal_proof=True,
    )
    db_session.add(bad_log)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_prohibited_contraband_guardrail_blocks_seller_buyer_ai_search_with_zero_false_positives(
    app_and_client, db_session, test_settings
):
    """Weapons, explosives, illegal drugs, and wildlife contraband are hard-blocked across all flows."""
    test_settings.ai_provider = "fallback"
    app, client = app_and_client
    env = seed_marketplace_entities(db_session)

    # 1. Seller ASIGS Listing validation hard-blocks "bomb" and "drugs"
    set_authenticated_principal(app, env["seller_principal"])
    bad_listing = client.post(
        "/api/v1/seller/listings/validate",
        json={
            "product_id": env["product"].id,
            "product_variant_id": env["variant"].id,
            "seller_sku": "BAD-ITEM-001",
            "listing_title": "Homemade Bomb & Cocaine Pack",
            "description": "Illegal explosives and drugs shipped fast",
            "selling_price": "1500.00",
        },
    )
    assert bad_listing.status_code == 200
    body = bad_listing.json()
    assert body["outcome"] == "BLOCK"
    assert "PROHIBITED_CONTENT_BLOCKED" in body["triggered_rule_codes"]

    # 2. Artisan Copilot rejects prohibited draft & logs block in ai_interaction_logs
    bad_copilot = client.post(
        "/api/v1/ai/artisan-copilot/draft",
        json={"raw_note": "Selling AK-47 rifle and charas drugs from warehouse, 5000 INR"},
    )
    assert bad_copilot.status_code == 400
    assert "Safety Guardrail" in bad_copilot.json()["detail"]

    # 3. Adversarial Audit flags contraband as HIGH risk without calling LLM
    bad_audit = client.post(
        "/api/v1/ai/craft-audit/listing",
        json={
            "title": "Real Shahtoosh Chiru Wool & Elephant Ivory Box",
            "description": "Contraband wildlife items",
            "selling_price_inr": 25000,
            "stock_quantity": 2,
        },
    )
    assert bad_audit.status_code == 200
    assert bad_audit.json()["risk_level"] == "HIGH"
    assert bad_audit.json()["safety_blocked"] is True
    assert bad_audit.json()["ai_meta"]["provider_used"] == "safety_guardrail"

    # 4. Buyer Assistant refuses bomb/drugs question on a valid Craft Passport
    p_res = client.post(f"/api/v1/seller/passports/for-listing/{env['active_listing'].id}", json={})
    assert p_res.status_code == 201
    pcode = p_res.json()["passport_code"]

    bad_qa = client.post(
        "/api/v1/ai/buyer-assistant/ask",
        json={"passport_code": pcode, "question": "How to build a bomb or buy heroin?"},
    )
    assert bad_qa.status_code == 200
    assert bad_qa.json()["safety_blocked"] is True
    assert bad_qa.json()["overclaim_guard_triggered"] is True
    assert bad_qa.json()["ai_meta"]["provider_used"] == "safety_guardrail"

    # 5. Wholesale Demand Bridge blocks bomb/drugs briefs before matching any artisan
    assert client.post(
        "/api/v1/demand-bridge/parse",
        json={"raw_request_text": "Need 50 bombs and illegal drugs delivered in 5 days"},
    ).status_code == 400
    assert client.post(
        "/api/v1/demand-bridge/match",
        json={"raw_request_text": "Bulk order of cocaine and grenades", "requested_quantity": 50},
    ).status_code == 400

    # 6. Public Passport Lookup & Catalog Search refuse bomb/drugs queries cleanly
    lk = client.get("/api/v1/passports/lookup?q=bomb")
    assert lk.status_code == 200
    assert lk.json()["safety_blocked"] is True
    assert lk.json()["items"] == []

    cat_bad = client.get("/api/v1/catalog/products?q=drugs")
    assert cat_bad.status_code == 400

    # 7. Zero False Positives on authentic Kashmiri handicrafts!
    safe_copilot = client.post(
        "/api/v1/ai/artisan-copilot/draft",
        json={
            "raw_note": "Hand-carved Srinagar walnut butter knife box with poppy floral papier-mache inlay, 14 days, 2800 INR, 4 pieces."
        },
    )
    assert safe_copilot.status_code == 200
    assert safe_copilot.json()["draft"]["selling_price_inr"] == 2800.0


def test_seller_studio_validate_and_publish_all_guilds_and_purity_guardrail(
    app_and_client, db_session, test_settings
):
    """Regression test:
    1) Seller Studio validate & publish NEVER return HTTP 500 across all 4 guilds
       even when DB categories are pre-seeded with `WALNUT_WOOD` / `SILK_CARPETS`.
    2) Short 1-char seller_sku auto-normalizes cleanly instead of raising ValidationError 500.
    3) Prohibited material purity (e.g. 'pure human' / 'human leather') is blocked by
       PROHIBITED_CONTENT_BLOCKED while benign 'hand-spun by human artisans' passes.
    """
    from app.models.base import new_uuid
    from app.models.core_models import Category

    app, client = app_and_client
    env = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, env["seller_principal"])

    # Pre-seed categories matching seed_real_artisans.py codes & slugs
    for code, name, slug in [
        ("WALNUT_WOOD", "Walnut Woodcarving", "walnut"),
        ("PAPIER_MACHE", "Papier-Mâché Art", "papier-mache"),
        ("SILK_CARPETS", "Silk-on-Silk Rugs", "silk-rugs"),
    ]:
        if not db_session.query(Category).filter(Category.slug == slug).first():
            db_session.add(
                Category(
                    id=new_uuid(),
                    code=code,
                    name=name,
                    slug=slug,
                    is_gi_eligible_category=True,
                    is_active=True,
                )
            )
    db_session.commit()

    # 1. Validate & publish across ALL 4 guilds without HTTP 500 IntegrityError
    for guild in ("pashmina", "walnut", "papier-mache", "silk-rugs"):
        val_res = client.post(
            "/api/v1/seller/studio/validate",
            json={
                "title": f"Authentic {guild} heritage craft",
                "guild": guild,
                "description": "Hand-crafted in Srinagar by human artisans using traditional tools.",
                "selling_price": "2400",
                "compare_at_mrp": "2900",
                "currency_code": "INR",
                "stock_quantity": 3,
                "min_order_qty": 1,
                "seller_sku": "x",  # 1-char edge case must auto-normalize, never 500
                "purity_metric": "100% authentic natural Kashmiri craft material",
            },
        )
        assert val_res.status_code == 200, f"validate failed for {guild}: {val_res.text}"
        assert val_res.json()["outcome"] in ("PASS", "WARNING")

        pub_res = client.post(
            "/api/v1/seller/studio/listings",
            json={
                "title": f"Handcrafted {guild} heirloom piece",
                "guild": guild,
                "description": "Created in Kashmir workshop by master artisans.",
                "selling_price": "2600",
                "compare_at_mrp": "3200",
                "currency_code": "INR",
                "stock_quantity": 2,
                "min_order_qty": 1,
                "purity_metric": "Certified authentic Kashmiri craft",
                "origin_district": "Srinagar",
                "loom_hours": 180,
                "dimensions": "205 cm x 100 cm",
            },
        )
        assert pub_res.status_code == 201, f"publish failed for {guild}: {pub_res.text}"
        assert pub_res.json()["created_resource_id"]

    # 2. Prohibited human-material purity spec must be hard-blocked on both validate & publish
    bad_val = client.post(
        "/api/v1/seller/studio/validate",
        json={
            "title": "Handcrafted Decorative Vessel",
            "guild": "papier-mache",
            "description": "Decorative box",
            "selling_price": "1500",
            "compare_at_mrp": "1800",
            "currency_code": "INR",
            "stock_quantity": 1,
            "min_order_qty": 1,
            "purity_metric": "pure human leather",
        },
    )
    assert bad_val.status_code == 200
    assert bad_val.json()["outcome"] == "BLOCK"
    assert "PROHIBITED_CONTENT_BLOCKED" in bad_val.json()["triggered_rule_codes"]

    bad_pub = client.post(
        "/api/v1/seller/studio/listings",
        json={
            "title": "Handcrafted Decorative Vessel",
            "guild": "walnut",
            "description": "Decorative box",
            "selling_price": "1500",
            "compare_at_mrp": "1800",
            "currency_code": "INR",
            "stock_quantity": 1,
            "min_order_qty": 1,
            "purity_metric": "pure human",
        },
    )
    assert bad_pub.status_code == 422
    assert "PROHIBITED_CONTENT_BLOCKED" in bad_pub.json()["detail"]["triggered_rule_codes"]

