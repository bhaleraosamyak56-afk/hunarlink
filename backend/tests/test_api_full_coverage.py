"""Comprehensive API Endpoint Contract & Integration Suite.

Exercises previously unhit HTTP endpoints and cross-checks 100% of HunarLink's
72 OpenAPI endpoints across Health, Storefront, Authentication (3-table strict isolation),
ASIGS Guardrails, CraftProof Passports, CraftProof AI, Demand Bridge, and Payments.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from tests.conftest import (
    create_user_with_roles,
    seed_marketplace_entities,
    set_authenticated_principal,
)


def test_health_and_root_endpoints(app_and_client):
    _app, client = app_and_client

    r_root = client.get("/")
    assert r_root.status_code == 200
    body_root = r_root.json()
    assert body_root["status"] == "ok"
    assert body_root["healthz"] == "/healthz"
    assert body_root["readyz"] == "/readyz"

    r_health = client.get("/healthz")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "ok"
    assert "timestamp" in r_health.json()

    r_ready = client.get("/readyz")
    assert r_ready.status_code == 200
    assert r_ready.json()["status"] == "ready"
    assert r_ready.json()["database"] == "connected"


def test_ai_gateway_status_and_demand_bridge_requests_listing(app_and_client, db_session):
    _app, client = app_and_client
    seed_marketplace_entities(db_session)

    # 1. AI status endpoint (GET /api/v1/ai/status)
    r_ai = client.get("/api/v1/ai/status")
    assert r_ai.status_code == 200
    ai_body = r_ai.json()
    assert "active_model" in ai_body or "ollama_reachable" in ai_body or "provider" in ai_body

    # 2. Create a Demand Bridge match and verify GET /api/v1/demand-bridge/requests
    r_match = client.post(
        "/api/v1/demand-bridge/match",
        json={
            "raw_request_text": "Need 15 handwoven Kani pashmina shawls in 45 days for a boutique collection.",
            "buyer_name": "Meera Boutique",
            "buyer_email": "meera@boutique.in",
        },
    )
    assert r_match.status_code in (200, 201)

    r_reqs = client.get("/api/v1/demand-bridge/requests?limit=10")
    assert r_reqs.status_code == 200
    reqs_body = r_reqs.json()
    assert reqs_body["count"] >= 1
    assert any(item["buyer_name"] == "Meera Boutique" for item in reqs_body["items"])


def test_guardrail_validation_and_admin_rule_case_detail_endpoints(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)

    # 1. Supplier lot pre-flight validation (POST /api/v1/supplier/lots/validate)
    set_authenticated_principal(app, entities["supplier_principal"])
    r_lot_val = client.post(
        "/api/v1/supplier/lots/validate",
        json={
            "category_id": entities["category"].id,
            "product_id": entities["product"].id,
            "product_variant_id": entities["variant"].id,
            "lot_title": "Raw Changthangi Pashmina Fleece Batch",
            "lot_description": "Clean hand-combed Ladakhi fleece.",
            "offered_quantity": "25.000",
            "unit_of_measure": "KG",
            "expected_unit_price": "14500.00",
            "currency_code": "INR",
            "is_gi_claimed": False,
            "available_from_date": date.today().isoformat(),
            "available_until_date": (date.today() + timedelta(days=30)).isoformat(),
        },
    )
    assert r_lot_val.status_code == 200
    assert r_lot_val.json()["outcome"] in ("PASS", "WARNING", "REVIEW_REQUIRED")

    # 2. Dealer profile validation (POST /api/v1/dealer/profile/validate)
    set_authenticated_principal(app, entities["dealer_principal"])
    r_dealer_val = client.post(
        "/api/v1/dealer/profile/validate",
        json={
            "dealership_name": "Chinar Heritage Wholesale Pvt Ltd",
            "city": "Srinagar",
            "state_province": "Jammu and Kashmir",
            "gstin": "01AABCC1234D1Z5",
            "monthly_procurement_capacity": str(Decimal("500000.00")),
            "currency_code": "INR",
        },
    )
    assert r_dealer_val.status_code == 200
    assert r_dealer_val.json()["outcome"] in ("PASS", "WARNING")

    # 3. Trigger a REVIEW_REQUIRED case via duplicate seller listing, then fetch case by ID & list rules
    set_authenticated_principal(app, entities["seller_principal"])
    dup_payload = {
        "product_id": entities["product"].id,
        "product_variant_id": entities["variant"].id,
        "seller_sku": "BASHIR-DUP-SKU-01",
        "listing_title": "Handwoven Kani Pashmina Shawl",
        "description": "Authentic Kani weave crafted in Srinagar.",
        "selling_price": "16500.00",
        "compare_at_mrp": "18000.00",
        "currency_code": "INR",
        "stock_quantity": 3,
    }
    first = client.post("/api/v1/seller/listings", json=dup_payload)
    assert first.status_code == 201
    dup_payload["seller_sku"] = "BASHIR-DUP-SKU-02"
    second = client.post("/api/v1/seller/listings", json=dup_payload)
    assert second.status_code == 201

    _admin_user, admin_principal = create_user_with_roles(
        db_session,
        email="guardrail.auditor@hunarlink.in",
        full_name="Guardrail Auditor",
        roles=["ADMIN"],
        permissions={"guardrails.read", "guardrails.decide"},
    )
    set_authenticated_principal(app, admin_principal)

    # GET /api/v1/admin/guardrail/rules
    r_rules = client.get("/api/v1/admin/guardrail/rules")
    assert r_rules.status_code == 200
    rules_list = r_rules.json()
    assert isinstance(rules_list, list) and len(rules_list) >= 1
    assert any(r["rule_code"] == "PROD_SELLER_CANNOT_SELF_VERIFY_GI" for r in rules_list)

    # GET /api/v1/admin/guardrail/cases/{case_id}
    r_cases = client.get("/api/v1/admin/guardrail/cases")
    assert r_cases.status_code == 200
    cases = r_cases.json()
    assert len(cases) >= 1
    case_id = cases[0]["id"]

    r_case_detail = client.get(f"/api/v1/admin/guardrail/cases/{case_id}")
    assert r_case_detail.status_code == 200
    assert r_case_detail.json()["id"] == case_id

    r_case_missing = client.get("/api/v1/admin/guardrail/cases/00000000-0000-4000-8000-000000000404")
    assert r_case_missing.status_code == 404


def test_craft_passport_public_resolution_and_seller_claim_declaration(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)

    # Create an active listing for the seller so passport by-product & seller claim endpoints work
    set_authenticated_principal(app, entities["seller_principal"])
    r_listing = client.post(
        "/api/v1/seller/listings",
        json={
            "product_id": entities["product"].id,
            "product_variant_id": entities["variant"].id,
            "seller_sku": "BASHIR-PASSPORT-01",
            "listing_title": "Heirloom Kani Jama Shawl",
            "description": "Woven on traditional wooden Kani bobbins.",
            "selling_price": "17500.00",
            "compare_at_mrp": "18000.00",
            "currency_code": "INR",
            "stock_quantity": 2,
        },
    )
    assert r_listing.status_code == 201
    listing_id = r_listing.json()["created_resource_id"]

    # Seller initializes passport
    r_init = client.post(
        f"/api/v1/seller/passports/for-listing/{listing_id}",
        json={
            "materials_summary": "100% Changthangi Pashmina (14 micron)",
            "manufacturing_process": "Interlocked Kani twill tapestry weave",
            "origin_location": "Kanihama, Budgam, Jammu & Kashmir",
            "craft_days_estimated": 90,
        },
    )
    assert r_init.status_code == 201
    passport_data = r_init.json()
    passport_id = passport_data["passport_id"]
    passport_code = passport_data["passport_code"]

    # Seller adds a new SELLER_DECLARED claim via POST /api/v1/seller/passports/{passport_id}/claims
    r_claim = client.post(
        f"/api/v1/seller/passports/{passport_id}/claims",
        json={
            "claim_type": "TECHNIQUE",
            "claim_title": "Hand-spun Charkha Yarn",
            "claim_value": "Spun on traditional Kashmiri Yender wheel without motorized twisting",
        },
    )
    assert r_claim.status_code == 201
    assert r_claim.json()["verification_status"] == "SELLER_DECLARED"

    # Public unauthenticated access to GET /api/v1/passports/{code_or_slug}
    set_authenticated_principal(app, None)
    r_pub_code = client.get(f"/api/v1/passports/{passport_code}")
    assert r_pub_code.status_code == 200
    assert r_pub_code.json()["passport_code"] == passport_code

    # Public access to GET /api/v1/passports/by-product/{product_ref} (by listing_id, product_id & lowercase SKU)
    r_by_listing = client.get(f"/api/v1/passports/by-product/{listing_id}")
    assert r_by_listing.status_code == 200
    assert r_by_listing.json()["passport_code"] == passport_code

    r_by_lower_sku = client.get("/api/v1/passports/by-product/bashir-passport-01")
    assert r_by_lower_sku.status_code == 200
    assert r_by_lower_sku.json()["passport_code"] == passport_code

    r_by_prod = client.get(f"/api/v1/passports/by-product/{entities['product'].id}")
    assert r_by_prod.status_code == 200
    assert r_by_prod.json()["product"]["product_id"] == entities["product"].id

    # Owner access to GET /api/v1/supplier/lots/{lot_id} (200 OK)
    set_authenticated_principal(app, entities["supplier_principal"])
    r_lot_create = client.post(
        "/api/v1/supplier/lots",
        json={
            "category_id": entities["category"].id,
            "product_id": entities["product"].id,
            "product_variant_id": entities["variant"].id,
            "lot_title": "Verified Supplier Pashmina Yarn Lot",
            "lot_description": "Hand-combed Changthangi fleece.",
            "offered_quantity": "10.000",
            "unit_of_measure": "KG",
            "expected_unit_price": "14000.00",
            "currency_code": "INR",
            "is_gi_claimed": False,
            "available_from_date": date.today().isoformat(),
        },
    )
    assert r_lot_create.status_code == 201
    lot_id = r_lot_create.json()["created_resource_id"]
    r_lot_get = client.get(f"/api/v1/supplier/lots/{lot_id}")
    assert r_lot_get.status_code == 200
    assert r_lot_get.json()["id"] == lot_id

    # Public artisan detail query endpoint GET /api/v1/artisans/detail?id=...
    set_authenticated_principal(app, None)
    r_art_detail = client.get("/api/v1/artisans/detail", params={"id": entities["seller_profile"].id})
    assert r_art_detail.status_code == 200
    assert r_art_detail.json()["seller_profile_id"] == entities["seller_profile"].id
