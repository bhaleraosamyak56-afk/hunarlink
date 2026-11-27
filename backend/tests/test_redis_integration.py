"""MySQL-direct mode verification — Redis has been removed.

Verifies Workbench DELETEs reflect instantly (no cache) and in-memory
rate limiting / JWT revocation still work.
"""

from __future__ import annotations

import time

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.cache import (
    bump_namespace_version,
    cache_get_or_set,
    clear_local_revoked_jtis,
    get_namespace_version,
    is_admin_token_revoked,
    revoke_admin_token_jti,
)
from app.core.config import Settings
from app.core.redis_client import get_redis_client, probe_redis_health
from app.core.security import SlidingWindowRateLimiter


def test_redis_removed_mysql_direct_and_rate_limiter_still_works(app_and_client):
    app, client = app_and_client

    # MySQL-direct: readyz should still work, redis disabled
    res = client.get("/readyz")
    assert res.status_code == 200
    assert res.json()["database"] == "connected"
    assert res.json()["redis"] == "disabled"

    # cache_get_or_set should call loader directly, no Redis
    called = {"n": 0}

    def loader():
        called["n"] += 1
        return {"hello": "world"}

    out = cache_get_or_set("test:key", ttl_seconds=60, loader=loader)
    assert out == {"hello": "world"}
    assert called["n"] == 1
    out2 = cache_get_or_set("test:key", ttl_seconds=60, loader=loader)
    assert called["n"] == 2  # no cache, called again

    # In-memory rate limiter
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60, scope="test")
    assert limiter.allow("k1")[0] is True
    assert limiter.allow("k1")[0] is True
    allowed, retry = limiter.allow("k1")
    assert allowed is False
    assert retry >= 1
    limiter.reset()
    assert limiter.allow("k1")[0] is True


def test_admin_jwt_revocation_in_memory(app_and_client):
    app, client = app_and_client
    clear_local_revoked_jtis()

    # Create a real admin login flow then logout revokes jti
    # Use in-memory revoke directly
    jti = "test-jti-12345"
    exp = int(time.time()) + 3600
    assert is_admin_token_revoked(jti) is False
    assert revoke_admin_token_jti(jti, exp) is True
    assert is_admin_token_revoked(jti) is True
    clear_local_revoked_jtis()
    assert is_admin_token_revoked(jti) is False


def test_redis_stub_returns_disabled():
    assert get_redis_client() is None
    assert get_namespace_version("catalog") == 1
    bump_namespace_version("catalog", "admin")  # no-op
    assert probe_redis_health()["status"] == "disabled"
