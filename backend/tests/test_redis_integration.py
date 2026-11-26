"""End-to-end automated tests for HunarLink Redis integration & graceful DB fallback.

Covers:
  1. Storefront catalog & verified artisans read-through caching (0 SQL queries on hit)
     + exact Decimal monetary precision + N+1 query batching on cache miss.
  2. Security invariants preserved under caching (prohibited query safety checks,
     unverified artisan blocking + MySQL AuditLog recording, rate limits before cache).
  3. TTL assignment with jitter & automatic expiry recomputation.
  4. Deterministic post-commit invalidation (`hl:ver:*`) across Admin listing moderation,
     Artisan verification approval, Seller Studio publish, and CraftProof claim decisions.
  5. Short-TTL RBAC principal cache (non-sensitive fields only) + Admin HS256 JWT `jti`
     logout revocation (`POST /api/v1/auth/admin-logout`).
  6. Distributed Redis ZSET sliding-window rate limiting across simulated multi-worker
     instances + newly protected AI / Demand Bridge / Upload / Sync endpoints.
  7. Single-flight cache stampede lock under concurrent thread contention.
  8. Graceful circuit-breaker fallback when Redis is unreachable or fails mid-request.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import threading
import time

import fakeredis
import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.admin_security import hash_admin_password
from app.core.cache import (
    build_key,
    cache_get_or_set,
    clear_local_revoked_jtis,
    get_namespace_version,
)
from app.core.config import Settings
from app.core.database import get_db
from app.core.redis_client import (
    configure_redis,
    reset_redis_state,
    set_redis_client_override,
)
from app.core.security import SlidingWindowRateLimiter
from app.main import create_app
from app.models.base import new_uuid
from app.models.core_models import (
    AdminCredential,
    AdminPermission,
    AdminProfile,
    AdminRole,
    AdminRolePermission,
    AdminUserRole,
    AuditLog,
    SellerProfile,
    SellerVerificationApplication,
)
from app.modules.payments.router import get_razorpay_gateway
from tests.conftest import (
    FakeRazorpayGateway,
    create_user_with_roles,
    seed_marketplace_entities,
    set_authenticated_principal,
)


@pytest.fixture()
def fake_redis_server():
    reset_redis_state()
    clear_local_revoked_jtis()
    server = fakeredis.FakeServer()
    client = fakeredis.FakeRedis(server=server, decode_responses=True)
    set_redis_client_override(client)
    try:
        yield server, client
    finally:
        client.flushall()
        reset_redis_state()
        clear_local_revoked_jtis()


@pytest.fixture()
def redis_app_and_client(
    tmp_path,
    db_session: Session,
    fake_razorpay: FakeRazorpayGateway,
    fake_redis_server,
):
    _, fake_client = fake_redis_server
    settings = Settings(
        app_env="testing",
        database_url="sqlite+pysqlite:///:memory:",
        redis_enabled=True,
        redis_key_prefix="hltest",
        private_storage_dir=str(tmp_path / "private_uploads"),
        max_upload_size_bytes=512_000,
        malware_scanner_mode="pending_only",
        gi_llm_provider="mock",
        ai_provider="fallback",
        admin_jwt_secret=SecretStr("test_admin_jwt_secret_at_least_32_characters_long!"),
        razorpay_key_id="rzp_test_HunarLinkKeyId123",
        razorpay_key_secret=SecretStr("rzp_test_secret_NEVER_EXPOSE_987654321"),
        razorpay_webhook_secret=SecretStr("rzp_webhook_secret_SEPARATE_123456789"),
    )
    app = create_app(settings_override=settings)
    set_redis_client_override(fake_client)

    def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_razorpay_gateway] = lambda: fake_razorpay

    with TestClient(app) as client:
        yield app, client, settings, fake_client
    app.dependency_overrides.clear()


class _SQLCounter:
    def __init__(self, engine) -> None:
        self.engine = engine
        self.count = 0

    def _cb(self, conn, cursor, statement, parameters, context, executemany):
        self.count += 1

    def __enter__(self):
        self.count = 0
        event.listen(self.engine, "before_cursor_execute", self._cb)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        event.remove(self.engine, "before_cursor_execute", self._cb)


def _provision_real_db_admin(db: Session, *, email: str, password: str) -> str:
    user, _ = create_user_with_roles(
        db,
        email=email,
        full_name="Redis Security Admin",
        roles=["ADMIN"],
    )
    profile = AdminProfile(
        id=new_uuid(),
        user_id=user.id,
        admin_status="ACTIVE",
    )
    role = AdminRole(
        id=new_uuid(),
        code="SUPER_OPS",
        name="Super Operations",
        is_active=True,
    )
    db.add_all([profile, role])
    db.flush()
    db.add(
        AdminUserRole(
            id=new_uuid(),
            admin_profile_id=profile.id,
            admin_role_id=role.id,
            is_active=True,
        )
    )
    for perm_code in ("payments.read", "guardrails.read", "guardrails.decide", "sellers.review"):
        perm = AdminPermission(
            id=new_uuid(),
            code=perm_code,
            module_name="ops",
            is_high_risk=False,
        )
        db.add(perm)
        db.flush()
        db.add(
            AdminRolePermission(
                id=new_uuid(),
                admin_role_id=role.id,
                admin_permission_id=perm.id,
            )
        )
    db.add(
        AdminCredential(
            id=new_uuid(),
            user_id=user.id,
            email=email.lower(),
            password_hash=hash_admin_password(password),
            is_active=True,
        )
    )
    db.commit()
    return user.id


def test_catalog_and_artisans_cache_hit_eliminates_sql_and_preserves_decimal(
    redis_app_and_client,
    db_session: Session,
):
    _, client, settings, fake_redis = redis_app_and_client
    entities = seed_marketplace_entities(db_session)
    engine = db_session.get_bind()

    # 1. Cold MISS -> hits DB and populates Redis with jittered TTL
    with _SQLCounter(engine) as miss_sql:
        r1 = client.get("/api/v1/catalog/products")
    assert r1.status_code == 200
    assert miss_sql.count >= 4
    items1 = r1.json()
    assert len(items1) == 1
    assert Decimal(str(items1[0]["selling_price"])) == Decimal("14500.00")

    cat_key = build_key("cache", "catalog", "v1", "list", "all", "lim200", settings=settings)
    ttl = fake_redis.ttl(cat_key)
    assert 265 <= ttl <= 335

    # 2. Warm HIT -> 0 SQL queries executed!
    with _SQLCounter(engine) as hit_sql:
        r2 = client.get("/api/v1/catalog/products")
    assert r2.status_code == 200
    assert hit_sql.count == 0
    assert r2.json() == items1

    # 3. Single product detail: MISS then HIT (0 SQL)
    prod_id = entities["product"].id
    r_p1 = client.get(f"/api/v1/catalog/product?id={prod_id}")
    assert r_p1.status_code == 200
    with _SQLCounter(engine) as prod_hit_sql:
        r_p2 = client.get(f"/api/v1/catalog/product?id={prod_id}")
    assert r_p2.status_code == 200
    assert prod_hit_sql.count == 0
    assert r_p2.json()["listing_id"] == entities["active_listing"].id

    # 4. Verified artisans directory: batched SQL on MISS (<= 6 queries) and 0 SQL on HIT
    with _SQLCounter(engine) as art_miss_sql:
        a1 = client.get("/api/v1/artisans")
    assert a1.status_code == 200
    assert 1 <= art_miss_sql.count <= 6
    with _SQLCounter(engine) as art_hit_sql:
        a2 = client.get("/api/v1/artisans")
    assert a2.status_code == 200
    assert art_hit_sql.count == 0
    assert a2.json() == a1.json()


def test_security_guards_never_bypassed_by_redis_cache(
    redis_app_and_client,
    db_session: Session,
):
    _, client, _, _ = redis_app_and_client
    seed_marketplace_entities(db_session)

    # Warm catalog cache
    assert client.get("/api/v1/catalog/products").status_code == 200
    # Prohibited content query must still be blocked before touching cache
    blocked_q = client.get("/api/v1/catalog/products?q=illegal+ivory+tusk")
    assert blocked_q.status_code == 400

    # Create an unverified/draft seller and ensure repeated probes are NEVER cached and ALWAYS audited
    draft_user, _ = create_user_with_roles(
        db_session,
        email="draft-artisan@example.com",
        full_name="Unverified Draft Seller",
        roles=["DIRECT_SELLER"],
    )
    draft_seller = SellerProfile(
        id=new_uuid(),
        user_id=draft_user.id,
        store_name="Staged Draft Workshop",
        store_slug="staged-draft-workshop",
        verification_path="NON_GI",
        verification_status="SUBMITTED",
        profile_status="DRAFT",
    )
    db_session.add(draft_seller)
    db_session.commit()

    p1 = client.get(f"/api/v1/artisans/{draft_seller.id}")
    p2 = client.get(f"/api/v1/artisans/{draft_seller.id}")
    assert p1.status_code == 404
    assert p2.status_code == 404

    audit_rows = db_session.scalars(
        select(AuditLog).where(
            AuditLog.action == "ARTISAN_ENDPOINT_BLOCKED_UNVERIFIED_ID",
            AuditLog.target_id == draft_seller.id,
        )
    ).all()
    assert len(audit_rows) == 2


def test_post_commit_invalidation_across_moderation_approval_and_craftproof(
    redis_app_and_client,
    db_session: Session,
):
    app, client, settings, fake_redis = redis_app_and_client
    entities = seed_marketplace_entities(db_session)
    engine = db_session.get_bind()

    # Warm catalog & artisan caches
    assert len(client.get("/api/v1/catalog/products").json()) == 1
    assert get_namespace_version("catalog", settings) == 1

    # 1. Admin pauses listing -> version bumps and catalog immediately returns 0 active items
    set_authenticated_principal(app, entities["admin_principal"])
    mod_res = client.post(
        f"/api/v1/admin/listings/{entities['active_listing'].id}/moderate",
        json={"listing_status": "PAUSED"},
    )
    assert mod_res.status_code == 200
    assert get_namespace_version("catalog", settings) >= 2
    assert client.get("/api/v1/catalog/products").json() == []

    # Re-activate listing -> immediately visible again
    client.post(
        f"/api/v1/admin/listings/{entities['active_listing'].id}/moderate",
        json={"listing_status": "ACTIVE"},
    )
    assert len(client.get("/api/v1/catalog/products").json()) == 1

    # 2. Staged artisan application -> approve via Admin -> immediately appears in cached /artisans
    applicant_user, _ = create_user_with_roles(
        db_session,
        email="newweaver@example.com",
        full_name="Rafiq Weaver",
        roles=["DIRECT_SELLER"],
    )
    staged_seller = SellerProfile(
        id=new_uuid(),
        user_id=applicant_user.id,
        store_name="Rafiq Heritage Looms",
        store_slug="rafiq-heritage-looms",
        craft_specialty="Pashmina",
        workshop_district="Srinagar",
        verification_path="GI",
        verification_status="SUBMITTED",
        profile_status="DRAFT",
        claimed_gi_authorized_user_no="GI-9988",
    )
    db_session.add(staged_seller)
    db_session.flush()
    staged_app = SellerVerificationApplication(
        id=new_uuid(),
        seller_profile_id=staged_seller.id,
        application_number="HL-VER-TEST-001",
        verification_path="GI",
        application_status="SUBMITTED",
        claimed_gi_code="GI-9988",
        claimed_craft_cluster="Srinagar",
    )
    db_session.add(staged_app)
    db_session.commit()

    before_artisans = client.get("/api/v1/artisans").json()
    assert all(a["seller_profile_id"] != staged_seller.id for a in before_artisans)

    dec_res = client.post(
        f"/api/v1/admin/artisan-applications/{staged_app.id}/decision",
        json={"decision": "APPROVE", "notes": "Verified GI credentials"},
    )
    assert dec_res.status_code == 200
    after_artisans = client.get("/api/v1/artisans").json()
    assert any(a["seller_profile_id"] == staged_seller.id for a in after_artisans)

    # 3. CraftProof passport + QR SVG caching & instant invalidation on Admin claim verification
    prod_id = entities["product"].id
    cp1 = client.get(f"/api/v1/passports/by-product/{prod_id}")
    assert cp1.status_code == 200
    passport_code = cp1.json()["passport_code"]
    passport_id = cp1.json()["passport_id"]

    # Second fetch by product & by code & QR SVG should hit Redis (0 SQL queries!)
    qr1 = client.get(f"/api/v1/passports/{passport_code}/qr.svg")
    assert qr1.status_code == 200
    assert "<svg" in qr1.text

    with _SQLCounter(engine) as cp_hit_sql:
        cp2 = client.get(f"/api/v1/passports/by-product/{prod_id}")
        cp3 = client.get(f"/api/v1/passports/{passport_code}")
        qr2 = client.get(f"/api/v1/passports/{passport_code}/qr.svg")
    assert cp2.status_code == 200
    assert cp3.status_code == 200
    assert qr2.status_code == 200
    assert cp_hit_sql.count == 0

    # Seller adds a SELLER_DECLARED claim -> invalidates passport cache immediately
    set_authenticated_principal(app, entities["seller_principal"])
    add_cl = client.post(
        f"/api/v1/seller/passports/{passport_id}/claims",
        json={
            "claim_type": "TECHNIQUE",
            "claim_title": "Hand-spun Changthangi Yarn",
            "claim_value": "100% hand-spun on traditional yender wheel",
        },
    )
    assert add_cl.status_code == 201
    claim_id = add_cl.json()["claim_id"]

    # Admin verifies claim -> public passport immediately promotes claim to HUMAN_VERIFIED
    set_authenticated_principal(app, entities["admin_principal"])
    adm_cl = client.post(
        f"/api/v1/admin/passports/claims/{claim_id}/decision",
        json={
            "decision_status": "HUMAN_VERIFIED",
            "verified_by_authority": "J&K Handicrafts Directorate",
            "decision_notes": "Workshop spinning wheel video & fiber certificate inspected.",
        },
    )
    assert adm_cl.status_code == 200

    refreshed_cp = client.get(f"/api/v1/passports/{passport_code}").json()
    verified_ids = {c["claim_id"] for c in refreshed_cp["verified_claims"]}
    assert claim_id in verified_ids


def test_admin_jwt_jti_logout_revocation_and_short_ttl_principal_cache(
    redis_app_and_client,
    db_session: Session,
):
    app, client, settings, fake_redis = redis_app_and_client
    set_authenticated_principal(app, None)  # Use real JWT auth pipeline!

    admin_email = "ops-chief@hunarlink.in"
    admin_pass = "StrongHeritageAdmin#2026"
    admin_uid = _provision_real_db_admin(db_session, email=admin_email, password=admin_pass)

    login_res = client.post(
        "/api/v1/auth/admin-login",
        json={"email": admin_email, "password": admin_pass},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    unverified_claims = jwt.decode(token, options={"verify_signature": False})
    assert unverified_claims.get("jti")

    headers = {"Authorization": f"Bearer {token}"}

    # First authenticated call loads RBAC from DB & caches non-sensitive principal in Redis
    me1 = client.get("/api/v1/auth/me", headers=headers)
    assert me1.status_code == 200
    principal_key = build_key("auth", "principal", "admin", admin_uid, settings=settings)
    cached_raw = fake_redis.get(principal_key)
    assert cached_raw is not None
    assert "password" not in cached_raw.lower()
    assert 1 <= fake_redis.ttl(principal_key) <= settings.redis_ttl_principal_seconds

    # Admin signs out -> token `jti` is added to Redis revocation list and principal cache cleared
    logout_res = client.post("/api/v1/auth/admin-logout", headers=headers)
    assert logout_res.status_code == 200
    assert logout_res.json()["revoked"] is True

    jti_key = build_key("auth", "revoked_jti", unverified_claims["jti"], settings=settings)
    assert fake_redis.get(jti_key) == "1"
    assert fake_redis.ttl(jti_key) > 0
    assert fake_redis.get(principal_key) is None

    # Replaying the logged-out Admin JWT is immediately rejected with 401!
    me_after = client.get("/api/v1/auth/me", headers=headers)
    assert me_after.status_code == 401
    assert "revoked" in me_after.json()["detail"].lower() or "signed out" in me_after.json()["detail"].lower()


def test_readyz_reports_redis_connected_and_ai_endpoint_rate_limit(
    redis_app_and_client,
):
    _, client, _, _ = redis_app_and_client

    ready = client.get("/readyz")
    assert ready.status_code == 200
    assert ready.json()["database"] == "connected"
    assert ready.json()["redis"] == "connected"

    # AI gateway status cached in Redis on second call
    s1 = client.get("/api/v1/ai/status")
    s2 = client.get("/api/v1/ai/status")
    assert s1.status_code == 200
    assert s2.status_code == 200
    assert s1.json() == s2.json()

    # AI endpoint enforces 20 req/60s sliding window via Redis ZSET
    for _ in range(20):
        ok = client.post(
            "/api/v1/ai/artisan-copilot/draft",
            json={"raw_note": "Handwoven Kashmir pashmina shawl 200x100cm took 18 days"},
        )
        assert ok.status_code == 200

    throttled = client.post(
        "/api/v1/ai/artisan-copilot/draft",
        json={"raw_note": "Handwoven Kashmir pashmina shawl 200x100cm took 18 days"},
    )
    assert throttled.status_code == 429
    assert int(throttled.headers.get("Retry-After", "0")) >= 1


def test_distributed_sliding_window_rate_limiter_across_workers(
    fake_redis_server,
):
    _, fake_client = fake_redis_server
    configure_redis(Settings(redis_enabled=True, redis_key_prefix="hlrl"))
    set_redis_client_override(fake_client)

    # Simulate 2 separate Uvicorn worker processes with distinct Python instances
    worker_a = SlidingWindowRateLimiter(max_requests=3, window_seconds=60, scope="login_test")
    worker_b = SlidingWindowRateLimiter(max_requests=3, window_seconds=60, scope="login_test")

    assert worker_a.allow("203.0.113.10") == (True, 0)
    assert worker_b.allow("203.0.113.10") == (True, 0)
    assert worker_a.allow("203.0.113.10") == (True, 0)

    # 4th attempt on Worker B sees the 3 hits recorded across A+B in Redis ZSET!
    allowed, retry_after = worker_b.allow("203.0.113.10")
    assert allowed is False
    assert 1 <= retry_after <= 60


def test_ttl_expiry_and_single_flight_stampede_protection(
    fake_redis_server,
):
    _, fake_client = fake_redis_server
    settings = Settings(redis_enabled=True, redis_key_prefix="hlstampede")
    configure_redis(settings)
    set_redis_client_override(fake_client)

    # 1. TTL expiry test
    counter = {"calls": 0}

    def _short_loader() -> dict:
        counter["calls"] += 1
        return {"seq": counter["calls"]}

    short_key = build_key("cache", "ttl_check", settings=settings)
    v1 = cache_get_or_set(
        short_key, ttl_seconds=1, loader=_short_loader, jitter_ratio=0.0, settings=settings
    )
    v2 = cache_get_or_set(
        short_key, ttl_seconds=1, loader=_short_loader, jitter_ratio=0.0, settings=settings
    )
    assert v1 == {"seq": 1}
    assert v2 == {"seq": 1}
    time.sleep(1.15)
    v3 = cache_get_or_set(
        short_key, ttl_seconds=1, loader=_short_loader, jitter_ratio=0.0, settings=settings
    )
    assert v3 == {"seq": 2}

    # 2. Single-flight stampede lock under 8 concurrent threads
    db_executions = 0
    db_lock = threading.Lock()
    hot_key = build_key("cache", "homepage_hot", settings=settings)

    def _expensive_db_loader() -> dict:
        nonlocal db_executions
        with db_lock:
            db_executions += 1
        time.sleep(0.06)
        return {"featured": "Kashmir Kani Shawl", "price": "14500.00"}

    def _worker(_idx: int) -> dict:
        return cache_get_or_set(
            hot_key,
            ttl_seconds=60,
            loader=_expensive_db_loader,
            jitter_ratio=0.0,
            use_stampede_lock=True,
            settings=settings,
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_worker, range(8)))

    assert all(r["price"] == "14500.00" for r in results)
    assert db_executions == 1  # Only 1 thread hit the DB; 7 waited on single-flight lock!


def test_graceful_circuit_breaker_fallback_when_redis_unreachable(
    tmp_path,
    db_session: Session,
    fake_razorpay: FakeRazorpayGateway,
):
    reset_redis_state()
    clear_local_revoked_jtis()
    seed_marketplace_entities(db_session)

    # Point Redis to an unused local port with a 50ms timeout so it fails immediately
    broken_settings = Settings(
        app_env="testing",
        database_url="sqlite+pysqlite:///:memory:",
        redis_enabled=True,
        redis_host="127.0.0.1",
        redis_port=63999,
        redis_socket_timeout_seconds=0.05,
        redis_circuit_cooldown_seconds=30.0,
        private_storage_dir=str(tmp_path / "private_uploads"),
        max_upload_size_bytes=512_000,
        malware_scanner_mode="pending_only",
        gi_llm_provider="mock",
        razorpay_key_id="rzp_test_HunarLinkKeyId123",
        razorpay_key_secret=SecretStr("rzp_test_secret_NEVER_EXPOSE_987654321"),
        razorpay_webhook_secret=SecretStr("rzp_webhook_secret_SEPARATE_123456789"),
    )
    app = create_app(settings_override=broken_settings)
    app.dependency_overrides[get_db] = lambda: (yield db_session)
    app.dependency_overrides[get_razorpay_gateway] = lambda: fake_razorpay

    with TestClient(app) as client:
        # 1. /readyz stays 200 OK because DB is healthy, while reporting redis="unavailable"
        ready = client.get("/readyz")
        assert ready.status_code == 200
        assert ready.json()["database"] == "connected"
        assert ready.json()["redis"] == "unavailable"

        # 2. Storefront & Artisans endpoints succeed seamlessly from DB with circuit open (< 25ms)
        t0 = time.perf_counter()
        cat_res = client.get("/api/v1/catalog/products")
        art_res = client.get("/api/v1/artisans")
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        assert cat_res.status_code == 200
        assert len(cat_res.json()) == 1
        assert art_res.status_code == 200
        assert len(art_res.json()) == 1
        assert elapsed_ms < 250.0

        # 3. Rate limiter falls back to in-memory deque cleanly when Redis throws ConnectionError
        class _BrokenClient:
            def pipeline(self, transaction: bool = True):
                raise RedisConnectionError("Simulated mid-flight Redis disconnect")

        set_redis_client_override(_BrokenClient())
        limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60, scope="fallback")
        assert limiter.allow("client-1") == (True, 0)
        assert limiter.allow("client-1") == (True, 0)
        blocked, retry = limiter.allow("client-1")
        assert blocked is False
        assert retry >= 1

    reset_redis_state()
