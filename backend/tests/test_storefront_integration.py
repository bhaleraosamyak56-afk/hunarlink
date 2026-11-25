"""End-to-end Storefront -> Retail Order -> Razorpay Checkout integration tests (6 tests)."""
from __future__ import annotations

from decimal import Decimal

from app.integrations.razorpay.signatures import compute_checkout_signature
from tests.conftest import seed_marketplace_entities, set_authenticated_principal


def test_01_catalog_and_artisans_require_auth_and_return_active_db_records(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, None)

    # Unauthenticated callers are blocked (401) from both catalog & artisans APIs
    assert client.get("/api/v1/catalog/products").status_code == 401
    assert client.get("/api/v1/artisans").status_code == 401

    # Authenticated user gets active, approved DB listings & verified DB artisans
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.get("/api/v1/catalog/products")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["listing_id"] == entities["active_listing"].id
    assert Decimal(items[0]["selling_price"]) == Decimal("14500.00")

    artisans_resp = client.get("/api/v1/artisans")
    assert artisans_resp.status_code == 200
    artisans = artisans_resp.json()
    assert len(artisans) == 1
    assert artisans[0]["slug"] == entities["seller_profile"].store_slug
    assert artisans[0]["listing_count"] == 1

    detail_resp = client.get(f"/api/v1/artisans/{entities['seller_profile'].store_slug}")
    assert detail_resp.status_code == 200
    assert len(detail_resp.json()["listings"]) == 1

    # Pausing listing excludes it from catalog immediately
    entities["active_listing"].listing_status = "PAUSED"
    db_session.commit()
    assert client.get("/api/v1/catalog/products").json() == []


def test_02_create_retail_order_requires_authentication(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, None)

    resp = client.post(
        "/api/v1/orders/retail",
        json={
            "items": [{"seller_listing_id": entities["active_listing"].id, "quantity": 1}],
            "shipping_address": {
                "name": "Priya Sharma",
                "phone": "+91 9811044210",
                "locality": "Residency Road",
                "city": "Jammu",
                "pincode": "180001",
            },
        },
    )
    assert resp.status_code == 401


def test_03_create_retail_order_forbids_client_price_fields(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, entities["buyer_principal"])

    resp = client.post(
        "/api/v1/orders/retail",
        json={
            "items": [{"seller_listing_id": entities["active_listing"].id, "quantity": 2}],
            "shipping_address": {
                "name": "Aarav Sharma",
                "phone": "+91 9811044210",
                "locality": "Gandhi Nagar",
                "city": "Jammu",
                "pincode": "180004",
            },
            "total_amount": "1.00",  # Forbidden extra field!
        },
    )
    assert resp.status_code == 422


def test_04_end_to_end_retail_order_to_razorpay_capture_and_my_orders(
    app_and_client, db_session, test_settings
):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, entities["buyer_principal"])

    # Step 1: Create server-validated retail order from listing_id & qty
    order_resp = client.post(
        "/api/v1/orders/retail",
        json={
            "items": [{"seller_listing_id": entities["active_listing"].id, "quantity": 2}],
            "shipping_address": {
                "name": "Aarav Sharma",
                "phone": "+91 9811044210",
                "locality": "Gandhi Nagar",
                "city": "Jammu",
                "pincode": "180004",
            },
            "payment_method": "RAZORPAY_STANDARD",
        },
    )
    assert order_resp.status_code == 201
    order = order_resp.json()
    assert Decimal(order["total_amount"]) == Decimal("29000.00")
    assert order["fulfilment_status"] == "PENDING_PAYMENT"

    # Step 2: Create Razorpay Standard Checkout order for the newly created order_id
    rzp_resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={
            "order_scope": "RETAIL",
            "order_id": order["order_id"],
            "idempotency_key": f"idem-e2e-{order['order_id']}",
        },
    )
    assert rzp_resp.status_code == 200
    rzp = rzp_resp.json()
    assert rzp["amount_paise"] == 2900000

    # Step 3: Verify HMAC signature & capture payment
    sig = compute_checkout_signature(
        stored_razorpay_order_id=rzp["razorpay_order_id"],
        razorpay_payment_id="pay_e2e_storefront_01",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    verify_resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": rzp["payment_id"],
            "razorpay_order_id": rzp["razorpay_order_id"],
            "razorpay_payment_id": "pay_e2e_storefront_01",
            "razorpay_signature": sig,
        },
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["payment_status"] == "CAPTURED"
    assert verify_resp.json()["fulfilment_status"] == "CONFIRMED"

    # Step 4: Confirm buyer sees order in /api/v1/orders/retail/my and other buyer does NOT
    my_orders = client.get("/api/v1/orders/retail/my").json()
    assert len(my_orders) == 1
    assert my_orders[0]["order_id"] == order["order_id"]
    assert my_orders[0]["payment_status"] == "CAPTURED"

    set_authenticated_principal(app, entities["other_principal"])
    assert client.get("/api/v1/orders/retail/my").json() == []


def test_05_cod_retail_order_stays_separate_from_razorpay(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, entities["buyer_principal"])

    cod_resp = client.post(
        "/api/v1/orders/retail",
        json={
            "items": [{"seller_listing_id": entities["active_listing"].id, "quantity": 1}],
            "shipping_address": {
                "name": "Aarav Sharma",
                "phone": "+91 9811044210",
                "locality": "Channi Himmat",
                "city": "Jammu",
                "pincode": "180015",
            },
            "payment_method": "COD",
        },
    )
    assert cod_resp.status_code == 201
    cod_order = cod_resp.json()
    assert cod_order["payment_method"] == "COD"
    assert cod_order["payment_status"] == "COD_PENDING"

    # Attempting to open Razorpay Checkout for a COD order MUST fail cleanly
    rzp_try = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={
            "order_scope": "RETAIL",
            "order_id": cod_order["order_id"],
            "idempotency_key": "idem-cod-e2e",
        },
    )
    assert rzp_try.status_code == 400


def test_06_inactive_listing_blocked_during_retail_order_creation(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    entities["active_listing"].listing_status = "PAUSED"
    db_session.commit()
    set_authenticated_principal(app, entities["buyer_principal"])

    resp = client.post(
        "/api/v1/orders/retail",
        json={
            "items": [{"seller_listing_id": entities["active_listing"].id, "quantity": 1}],
            "shipping_address": {
                "name": "Aarav Sharma",
                "phone": "+91 9811044210",
                "locality": "Residency Road",
                "city": "Jammu",
                "pincode": "180001",
            },
        },
    )
    assert resp.status_code == 409


def test_07_readyz_reports_truthful_database_connectivity(app_and_client):
    _app, client = app_and_client
    resp = client.get("/readyz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["database"] == "connected"
    assert body["database_dialect"] == "sqlite"
