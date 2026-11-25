"""Automated test suite for HunarLink Razorpay Payment Gateway Integration — 30 tests.

NOTE: These are automated mocked unit/integration tests using FakeRazorpayGateway.
They verify server-side calculation, signature verification, webhook raw-body HMAC,
idempotency, out-of-order protection, refunds, and strict separation of Retail,
Wholesale, COD, and Supplier Procurement flows. Live Razorpay Test Mode / Live Mode
checks require real merchant keys in the user's staging/production environment.
"""
from __future__ import annotations

import json
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.integrations.razorpay.schemas import paise_to_rupees, rupees_to_paise
from app.integrations.razorpay.signatures import (
    compute_checkout_signature,
    compute_webhook_signature,
)
from app.models.core_models import AuditLog, Payment, RetailOrder
from tests.conftest import (
    create_retail_order,
    create_wholesale_order,
    seed_marketplace_entities,
    set_authenticated_principal,
)


# 1. Exact Decimal rupees <-> integer paise conversion (no floating-point errors)
def test_01_decimal_rupees_to_paise_conversion():
    assert rupees_to_paise(Decimal("19.99")) == 1999
    assert rupees_to_paise(Decimal("14500.00")) == 1450000
    assert rupees_to_paise(Decimal("1250.55")) == 125055
    assert paise_to_rupees(1999) == Decimal("19.99")
    with pytest.raises(ValueError):
        rupees_to_paise(Decimal("0.00"))


# 2. Unauthenticated create-order rejected
def test_02_unauthenticated_create_order_rejected(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, None)
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-unauth-1"},
    )
    assert resp.status_code == 401


# 3. Buyer cannot initiate payment for another user's retail order
def test_03_other_user_cannot_pay_for_retail_order(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["other_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-other-1"},
    )
    assert resp.status_code == 403


# 4. Retail create-order recalculates total server-side & ignores tampered client amount
def test_04_retail_create_order_server_recalculation_ignores_client_amount(
    app_and_client, db_session, fake_razorpay
):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
        unit_price=Decimal("14500.00"),
        quantity=2,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={
            "order_scope": "RETAIL",
            "order_id": order.id,
            "idempotency_key": "idem-ret-tamper-1",
            "amount": 1,  # Browser attempts to tamper total to ₹1 -> MUST BE IGNORED!
            "total_amount": "1.00",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["amount_paise"] == 2900000  # 2 * 14500.00 * 100
    assert Decimal(body["amount_rupees"]) == Decimal("29000.00")
    assert body["currency"] == "INR"
    assert fake_razorpay.create_order_calls == 1


# 5. Create-order response NEVER exposes secret keys
def test_05_create_order_response_never_exposes_secrets(app_and_client, db_session, test_settings):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-sec-1"},
    )
    raw = resp.text
    assert test_settings.razorpay_key_id in raw
    assert test_settings.razorpay_key_secret.get_secret_value() not in raw
    assert test_settings.razorpay_webhook_secret.get_secret_value() not in raw


# 6. Inactive/unverified seller or paused listing blocks retail payment creation
def test_06_inactive_listing_or_unverified_seller_blocked(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    entities["active_listing"].listing_status = "PAUSED"
    db_session.commit()

    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-paused-1"},
    )
    assert resp.status_code == 409


# 7. COD order cannot create an online Razorpay order
def test_07_cod_order_rejected_from_razorpay_checkout(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    cod_order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
        payment_method="COD",
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": cod_order.id, "idempotency_key": "idem-cod-1"},
    )
    assert resp.status_code == 400
    assert "cod" in resp.json()["detail"].lower()


# 8. Non-INR currency order rejected
def test_08_non_inr_currency_rejected(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    usd_order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
        currency_code="USD",
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": usd_order.id, "idempotency_key": "idem-usd-1"},
    )
    assert resp.status_code == 400
    assert "inr" in resp.json()["detail"].lower()


# 9. Supplier-to-dealer procurement PO blocked from customer Razorpay Checkout
def test_09_supplier_procurement_blocked_from_customer_checkout(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, entities["dealer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={
            "order_scope": "SUPPLIER_PROCUREMENT",
            "order_id": "po-12345",
            "idempotency_key": "idem-proc-1",
        },
    )
    assert resp.status_code == 400
    assert "procurement" in resp.json()["detail"].lower()


# 10. Direct wholesale listing order create-order succeeds
def test_10_wholesale_direct_listing_create_order_succeeds(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    ws_order = create_wholesale_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        dealer_profile_id=entities["dealer_profile"].id,
        ws_listing_id=entities["ws_listing"].id,
        product_variant_id=entities["variant"].id,
        order_source="DIRECT_WHOLESALE_LISTING",
        unit_price=Decimal("11000.00"),
        quantity=Decimal("5.000"),
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "WHOLESALE", "order_id": ws_order.id, "idempotency_key": "idem-ws-1"},
    )
    assert resp.status_code == 200
    assert resp.json()["amount_paise"] == 5500000


# 11. Wholesale order from valid ACCEPTED RFQ quote succeeds
def test_11_wholesale_accepted_rfq_quote_create_order_succeeds(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    ws_order = create_wholesale_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        dealer_profile_id=entities["dealer_profile"].id,
        ws_listing_id=None,
        product_variant_id=entities["variant"].id,
        order_source="ACCEPTED_RFQ_QUOTE",
        quote_valid_until_offset_hours=24,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "WHOLESALE", "order_id": ws_order.id, "idempotency_key": "idem-rfq-ok"},
    )
    assert resp.status_code == 200
    assert resp.json()["order_scope"] == "WHOLESALE"


# 12. Wholesale order from EXPIRED RFQ quote blocked
def test_12_wholesale_expired_rfq_quote_blocked(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    ws_order = create_wholesale_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        dealer_profile_id=entities["dealer_profile"].id,
        ws_listing_id=None,
        product_variant_id=entities["variant"].id,
        order_source="ACCEPTED_RFQ_QUOTE",
        quote_valid_until_offset_hours=-2,  # Expired 2 hours ago
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "WHOLESALE", "order_id": ws_order.id, "idempotency_key": "idem-rfq-exp"},
    )
    assert resp.status_code == 409
    assert "expired" in resp.json()["detail"].lower()


# 13. Wholesale order for suspended/unverified dealer blocked
def test_13_wholesale_suspended_dealer_blocked(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    ws_order = create_wholesale_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        dealer_profile_id=entities["dealer_profile"].id,
        ws_listing_id=entities["ws_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    entities["dealer_profile"].profile_status = "SUSPENDED"
    db_session.commit()

    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "WHOLESALE", "order_id": ws_order.id, "idempotency_key": "idem-ws-susp"},
    )
    assert resp.status_code == 409


# 14. Idempotent create-order replay returns same Razorpay order without duplicate call
def test_14_create_order_idempotency_key_replay(app_and_client, db_session, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    payload = {"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-replay-1"}
    r1 = client.post("/api/v1/payments/razorpay/create-order", json=payload)
    r2 = client.post("/api/v1/payments/razorpay/create-order", json=payload)

    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["razorpay_order_id"] == r2.json()["razorpay_order_id"]
    assert r2.json()["idempotent_replay"] is True
    assert fake_razorpay.create_order_calls == 1


# 15. Second create-order on same unpaid order with NEW idempotency key reuses active order
def test_15_duplicate_create_order_same_order_reuses_active(app_and_client, db_session, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    r1 = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-same-A"},
    )
    r2 = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-same-B"},
    )
    assert r1.json()["razorpay_order_id"] == r2.json()["razorpay_order_id"]
    assert r2.json()["idempotent_replay"] is True
    assert fake_razorpay.create_order_calls == 1


# 16. Already CAPTURED order cannot create another Razorpay order
def test_16_already_captured_order_blocks_new_payment(app_and_client, db_session, test_settings):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-cap-1"},
    ).json()

    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_test_alreadycap1",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    ver = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_alreadycap1",
            "razorpay_signature": sig,
        },
    )
    assert ver.status_code == 200
    assert ver.json()["payment_status"] == "CAPTURED"

    again = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-cap-2"},
    )
    assert again.status_code == 409


# 17. Gateway timeout during create-order marks RECONCILIATION_REQUIRED & blocks blind duplicate
def test_17_gateway_timeout_marks_reconciliation_required(app_and_client, db_session, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    fake_razorpay.fail_create_order_with = "timeout"
    set_authenticated_principal(app, entities["buyer_principal"])
    r1 = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-to-1"},
    )
    assert r1.status_code == 504

    payment_row = db_session.scalar(select(Payment).where(Payment.retail_order_id == order.id))
    assert payment_row.payment_status == "RECONCILIATION_REQUIRED"

    # Blind second attempt blocked with 409 until reconciled
    fake_razorpay.fail_create_order_with = None
    r2 = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-to-2"},
    )
    assert r2.status_code == 409


# 18. Explicit Razorpay gateway rejection marks attempt FAILED cleanly
def test_18_gateway_error_marks_failed_cleanly(app_and_client, db_session, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    fake_razorpay.fail_create_order_with = "gateway_error"
    set_authenticated_principal(app, entities["buyer_principal"])
    resp = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-err-1"},
    )
    assert resp.status_code == 502
    payment_row = db_session.scalar(select(Payment).where(Payment.retail_order_id == order.id))
    assert payment_row.payment_status == "FAILED"


# 19. Checkout verify with valid HMAC signature captures payment & confirms fulfilment
def test_19_verify_valid_signature_captures_and_confirms_order(app_and_client, db_session, test_settings):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v19"},
    ).json()

    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_test_valid19",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_valid19",
            "razorpay_signature": sig,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["payment_status"] == "CAPTURED"
    assert data["fulfilment_status"] == "CONFIRMED"


# 20. Checkout verify rejects invalid signature
def test_20_verify_invalid_signature_rejected(app_and_client, db_session):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v20"},
    ).json()

    resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_bad20",
            "razorpay_signature": "0" * 64,
        },
    )
    assert resp.status_code == 400
    assert "signature" in resp.json()["detail"].lower()


# 21. Checkout verify rejects tampered browser order_id vs DB-stored provider_order_id
def test_21_verify_tampered_order_id_rejected(app_and_client, db_session, test_settings):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v21"},
    ).json()

    fake_order_id = "order_test_TAMPERED999"
    sig = compute_checkout_signature(
        stored_razorpay_order_id=fake_order_id,
        razorpay_payment_id="pay_test_tamp21",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": fake_order_id,
            "razorpay_payment_id": "pay_test_tamp21",
            "razorpay_signature": sig,
        },
    )
    assert resp.status_code == 400


# 22. Checkout verify rejects amount mismatch from Razorpay fetch
def test_22_verify_amount_mismatch_rejected(app_and_client, db_session, test_settings, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v22"},
    ).json()

    fake_razorpay.override_payment_amount_paise = 100  # Only ₹1 instead of ₹29,000!
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_test_amt22",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_amt22",
            "razorpay_signature": sig,
        },
    )
    assert resp.status_code == 400
    assert "amount" in resp.json()["detail"].lower()


# 23. Checkout verify rejects currency mismatch from Razorpay fetch
def test_23_verify_currency_mismatch_rejected(app_and_client, db_session, test_settings, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v23"},
    ).json()

    fake_razorpay.override_payment_currency = "USD"
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_test_cur23",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_cur23",
            "razorpay_signature": sig,
        },
    )
    assert resp.status_code == 400
    assert "currency" in resp.json()["detail"].lower()


# 24. AUTHORIZED (not yet captured) does NOT mark order CONFIRMED
def test_24_authorized_payment_does_not_confirm_fulfilment(
    app_and_client, db_session, test_settings, fake_razorpay
):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v24"},
    ).json()

    fake_razorpay.next_payment_status = "authorized"
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_test_auth24",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    resp = client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_test_auth24",
            "razorpay_signature": sig,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["payment_status"] == "AUTHORIZED"
    assert resp.json()["fulfilment_status"] == "PENDING_PAYMENT"  # NOT CONFIRMED!


# 25. Duplicate checkout verify call is idempotent
def test_25_verify_duplicate_call_idempotent(app_and_client, db_session, test_settings, fake_razorpay):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-v25"},
    ).json()
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_test_dup25",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    body = {
        "payment_id": created["payment_id"],
        "razorpay_order_id": created["razorpay_order_id"],
        "razorpay_payment_id": "pay_test_dup25",
        "razorpay_signature": sig,
    }
    r1 = client.post("/api/v1/payments/razorpay/verify", json=body)
    r2 = client.post("/api/v1/payments/razorpay/verify", json=body)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["idempotent_replay"] is True
    assert fake_razorpay.fetch_payment_calls == 1


# 26. Webhook rejects invalid signature AND rejects signing with API key_secret instead of webhook_secret
def test_26_webhook_signature_uses_separate_webhook_secret(app_and_client, test_settings):
    _, client = app_and_client
    raw = json.dumps({"event": "payment.captured", "payload": {}}).encode("utf-8")

    # Wrong signature
    r1 = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": "deadbeef", "x-razorpay-event-id": "evt_bad1"},
    )
    assert r1.status_code == 400

    # Signed with RAZORPAY_KEY_SECRET instead of RAZORPAY_WEBHOOK_SECRET -> MUST FAIL!
    wrong_secret_sig = compute_webhook_signature(
        raw_body=raw,
        webhook_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    r2 = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": wrong_secret_sig, "x-razorpay-event-id": "evt_bad2"},
    )
    assert r2.status_code == 400


# 27. Webhook payment.captured confirms order & duplicate x-razorpay-event-id is safely ignored
def test_27_webhook_payment_captured_and_idempotent_redelivery(
    app_and_client, db_session, test_settings
):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-wh27"},
    ).json()

    payload_dict = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_wh_27",
                    "order_id": created["razorpay_order_id"],
                    "amount": created["amount_paise"],
                    "currency": "INR",
                    "status": "captured",
                }
            }
        },
    }
    raw = json.dumps(payload_dict, separators=(",", ":")).encode("utf-8")
    sig = compute_webhook_signature(
        raw_body=raw,
        webhook_secret=test_settings.razorpay_webhook_secret.get_secret_value(),
    )

    r1 = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "x-razorpay-event-id": "evt_cap_27"},
    )
    assert r1.status_code == 200
    assert r1.json()["processing_status"] == "PROCESSED"

    refreshed_order = db_session.scalar(select(RetailOrder).where(RetailOrder.id == order.id))
    assert refreshed_order.payment_status == "CAPTURED"
    assert refreshed_order.fulfilment_status == "CONFIRMED"

    # Re-deliver exact same event ID -> DUPLICATE_IGNORED
    r2 = client.post(
        "/api/v1/webhooks/razorpay",
        content=raw,
        headers={"X-Razorpay-Signature": sig, "x-razorpay-event-id": "evt_cap_27"},
    )
    assert r2.status_code == 200
    assert r2.json()["processing_status"] == "DUPLICATE_IGNORED"


# 28. Out-of-order delayed payment.failed webhook CANNOT downgrade CAPTURED payment
def test_28_out_of_order_payment_failed_cannot_downgrade_captured(
    app_and_client, db_session, test_settings
):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-ooo28"},
    ).json()

    # First capture via verify
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_ooo_28",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_ooo_28",
            "razorpay_signature": sig,
        },
    )

    # Now send delayed payment.failed webhook
    failed_raw = json.dumps(
        {
            "event": "payment.failed",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_ooo_28_old_attempt",
                        "order_id": created["razorpay_order_id"],
                        "error_description": "Bank timeout on earlier attempt",
                    }
                }
            },
        }
    ).encode("utf-8")
    wh_sig = compute_webhook_signature(
        raw_body=failed_raw,
        webhook_secret=test_settings.razorpay_webhook_secret.get_secret_value(),
    )
    wh = client.post(
        "/api/v1/webhooks/razorpay",
        content=failed_raw,
        headers={"X-Razorpay-Signature": wh_sig, "x-razorpay-event-id": "evt_ooo_fail_28"},
    )
    assert wh.status_code == 200
    assert wh.json()["processing_status"] == "IGNORED_OUT_OF_ORDER"

    pay = db_session.scalar(select(Payment).where(Payment.id == created["payment_id"]))
    assert pay.payment_status == "CAPTURED"


# 29. Refund RBAC enforced; Admin partial + completing refunds transition cleanly & write audit_logs
def test_29_refund_rbac_partial_full_and_audit_log(app_and_client, db_session, test_settings):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
        unit_price=Decimal("10000.00"),
        quantity=1,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-ref29"},
    ).json()
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_ref_29",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_ref_29",
            "razorpay_signature": sig,
        },
    )

    # Buyer cannot self-refund (403)
    unauth_ref = client.post(
        f"/api/v1/payments/{created['payment_id']}/refund",
        json={"refund_type": "FULL", "reason": "Unauthorized attempt", "idempotency_key": "rfd-buyer"},
    )
    assert unauth_ref.status_code == 403

    # Admin issues partial refund of ₹4,000 -> PARTIALLY_REFUNDED
    set_authenticated_principal(app, entities["admin_principal"])
    p1 = client.post(
        f"/api/v1/payments/{created['payment_id']}/refund",
        json={
            "refund_type": "PARTIAL",
            "amount": "4000.00",
            "reason": "Minor weave blemish agreed discount",
            "idempotency_key": "rfd-part-1",
        },
    )
    assert p1.status_code == 200
    assert p1.json()["payment_status"] == "PARTIALLY_REFUNDED"

    # Admin issues remaining FULL refund (₹6,000) -> REFUNDED
    p2 = client.post(
        f"/api/v1/payments/{created['payment_id']}/refund",
        json={
            "refund_type": "FULL",
            "reason": "Order returned by customer in original condition",
            "idempotency_key": "rfd-part-2",
        },
    )
    assert p2.status_code == 200
    assert Decimal(p2.json()["amount"]) == Decimal("6000.00")
    assert p2.json()["payment_status"] == "REFUNDED"

    audits = db_session.scalars(select(AuditLog).where(AuditLog.target_type == "refunds")).all()
    assert len(audits) == 2


# 30. Over-refund blocked, refund idempotency replay works, and Admin read APIs expose audit trails
def test_30_over_refund_blocked_idempotent_refund_and_admin_read_apis(
    app_and_client, db_session, test_settings, fake_razorpay
):
    app, client = app_and_client
    entities = seed_marketplace_entities(db_session)
    order = create_retail_order(
        db_session,
        buyer_user_id=entities["buyer_user"].id,
        seller_profile_id=entities["seller_profile"].id,
        listing_id=entities["active_listing"].id,
        product_variant_id=entities["variant"].id,
        unit_price=Decimal("5000.00"),
        quantity=1,
    )
    set_authenticated_principal(app, entities["buyer_principal"])
    created = client.post(
        "/api/v1/payments/razorpay/create-order",
        json={"order_scope": "RETAIL", "order_id": order.id, "idempotency_key": "idem-ref30"},
    ).json()
    sig = compute_checkout_signature(
        stored_razorpay_order_id=created["razorpay_order_id"],
        razorpay_payment_id="pay_ref_30",
        key_secret=test_settings.razorpay_key_secret.get_secret_value(),
    )
    client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "payment_id": created["payment_id"],
            "razorpay_order_id": created["razorpay_order_id"],
            "razorpay_payment_id": "pay_ref_30",
            "razorpay_signature": sig,
        },
    )

    # Buyer can query their own payment status & order payment status
    assert client.get(f"/api/v1/payments/{created['payment_id']}").status_code == 200
    assert client.get(f"/api/v1/orders/RETAIL/{order.id}/payment-status").status_code == 200

    # Admin tries to over-refund ₹5,001 on ₹5,000 captured payment -> BLOCKED (400)
    set_authenticated_principal(app, entities["admin_principal"])
    over = client.post(
        f"/api/v1/payments/{created['payment_id']}/refund",
        json={
            "refund_type": "PARTIAL",
            "amount": "5001.00",
            "reason": "Accidental over-refund entry",
            "idempotency_key": "rfd-over-30",
        },
    )
    assert over.status_code == 400
    assert "exceeds" in over.json()["detail"].lower()

    # Valid partial refund + duplicate idempotency replay -> only 1 gateway refund call!
    ref_body = {
        "refund_type": "PARTIAL",
        "amount": "1500.00",
        "reason": "Shipping damage adjustment",
        "idempotency_key": "rfd-idem-30",
    }
    r1 = client.post(f"/api/v1/payments/{created['payment_id']}/refund", json=ref_body)
    r2 = client.post(f"/api/v1/payments/{created['payment_id']}/refund", json=ref_body)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r2.json()["idempotent_replay"] is True
    assert fake_razorpay.create_refund_calls == 1

    # Admin read endpoints return payments, webhooks, and refunds cleanly
    assert len(client.get("/api/v1/admin/payments").json()) == 1
    assert client.get(f"/api/v1/admin/payments/{created['payment_id']}").status_code == 200
    assert client.get("/api/v1/admin/payment-webhooks").status_code == 200
    assert len(client.get("/api/v1/admin/refunds").json()) == 1
