"""Clean Redis caching, invalidation, stampede-lock & Admin JWT revocation layer.

Architectural rules:
  1. Business routers never construct raw Redis socket commands directly; they use
     domain-aligned helpers from this module.
  2. MySQL is always the source of truth:
       - Write paths commit to MySQL FIRST and invoke `invalidate_*_cache()` AFTER
         `db.commit()`.
       - Read paths use `cache_get_or_set()` with automatic fallback to `loader()`
         whenever Redis is disabled or unreachable.
  3. Domain invalidation uses atomic `O(1)` version counters (`INCR hl:ver:{domain}`)
     instead of `KEYS *` scans, which would block single-threaded Redis in prod.
  4. Monetary `Decimal` precision and Pydantic schemas are preserved end-to-end via
     `pydantic.TypeAdapter` JSON serialization.
"""
from __future__ import annotations

import hashlib
import json
import logging
import random
import threading
import time
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, TypeVar

from pydantic import BaseModel, TypeAdapter
from redis.exceptions import RedisError

from app.core.config import Settings, get_settings
from app.core.redis_client import get_redis_client, mark_redis_unavailable

logger = logging.getLogger("hunarlink.cache")

T = TypeVar("T")

# Bounded in-process fallback for revoked Admin JWT `jti`s when Redis is offline/disabled
_local_revoked_lock = threading.Lock()
_local_revoked_jtis: dict[str, float] = {}


def _resolve_settings(settings: Settings | None = None) -> Settings:
    return settings if settings is not None else get_settings()


def _clean_segment(part: str) -> str:
    return str(part).strip().replace(" ", "_")


def build_key(*parts: str, settings: Settings | None = None) -> str:
    """Build a namespaced Redis key `<REDIS_KEY_PREFIX>:<part1>:<part2>...`."""
    resolved = _resolve_settings(settings)
    prefix = (resolved.redis_key_prefix or "hl").strip().rstrip(":") or "hl"
    cleaned = [_clean_segment(p) for p in parts if str(p).strip()]
    return ":".join([prefix, *cleaned])


def hash_query_fragment(raw: str) -> str:
    """Deterministic compact SHA-256 digest for free-text query keys."""
    normalized = (raw or "").strip().lower().encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()[:24]


def apply_ttl_jitter(base_ttl: int, jitter_ratio: float = 0.10) -> int:
    """Apply ±jitter_ratio uniform jitter to avoid synchronized mass key expiry."""
    ttl = max(1, int(base_ttl))
    if jitter_ratio <= 0 or ttl < 20:
        return ttl
    delta = max(1, int(round(ttl * jitter_ratio)))
    return max(5, ttl + random.randint(-delta, delta))


def _json_default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, (set, frozenset)):
        return sorted(obj)
    if isinstance(obj, BaseModel):
        return obj.model_dump(mode="json")
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def serialize_value(value: T, type_adapter: TypeAdapter[T] | None = None) -> str:
    if type_adapter is not None:
        return type_adapter.dump_json(value).decode("utf-8")
    return json.dumps(value, default=_json_default, separators=(",", ":"))


def deserialize_value(raw: str, type_adapter: TypeAdapter[T] | None = None) -> T:
    if type_adapter is not None:
        return type_adapter.validate_json(raw)
    return json.loads(raw)


# ---------------------------------------------------------------------------
# O(1) Domain Namespace Versioning (`hl:ver:{domain}`)
# ---------------------------------------------------------------------------
def get_namespace_version(domain: str, settings: Settings | None = None) -> int:
    """Fetch the current monotonic version integer for a cache domain (`>= 1`)."""
    client = get_redis_client(settings)
    if client is None:
        return 1
    ver_key = build_key("ver", domain, settings=settings)
    try:
        raw = client.get(ver_key)
        if raw is not None:
            return max(1, int(raw))
        client.setnx(ver_key, "1")
        return 1
    except (RedisError, OSError, ValueError) as exc:
        if isinstance(exc, (RedisError, OSError)):
            mark_redis_unavailable(exc, settings)
        return 1


def bump_namespace_version(*domains: str, settings: Settings | None = None) -> None:
    """Atomically increment one or more domain version counters (`O(1)` invalidation)."""
    if not domains:
        return
    client = get_redis_client(settings)
    if client is None:
        return
    try:
        pipe = client.pipeline(transaction=False)
        for domain in dict.fromkeys(domains):
            pipe.incr(build_key("ver", domain, settings=settings))
        pipe.execute()
    except (RedisError, OSError) as exc:
        mark_redis_unavailable(exc, settings)


def invalidate_catalog_cache(settings: Settings | None = None) -> None:
    """Invalidate public catalog lists, product details, and admin/readyz counts."""
    bump_namespace_version("catalog", "admin", settings=settings)


def invalidate_artisan_cache(settings: Settings | None = None) -> None:
    """Invalidate verified artisan directory, artisan profiles, catalog & admin counts."""
    bump_namespace_version("artisans", "catalog", "admin", settings=settings)


def invalidate_passport_cache(settings: Settings | None = None) -> None:
    """Invalidate public CraftProof passport JSON, product-ref aliases & lookups."""
    bump_namespace_version("passports", settings=settings)


def invalidate_admin_overview_cache(settings: Settings | None = None) -> None:
    """Invalidate short-lived Admin Console overview and `/readyz` public counts."""
    bump_namespace_version("admin", settings=settings)


# ---------------------------------------------------------------------------
# Low-level Get / Set / Delete + Stampede-Protected Read-Through
# ---------------------------------------------------------------------------
def cache_get_raw(key: str, *, settings: Settings | None = None) -> str | None:
    client = get_redis_client(settings)
    if client is None:
        return None
    try:
        val = client.get(key)
        return str(val) if val is not None else None
    except (RedisError, OSError) as exc:
        mark_redis_unavailable(exc, settings)
        return None


def cache_set_raw(
    key: str,
    raw_value: str,
    *,
    ttl_seconds: int,
    jitter_ratio: float = 0.0,
    settings: Settings | None = None,
) -> bool:
    client = get_redis_client(settings)
    if client is None:
        return False
    effective_ttl = apply_ttl_jitter(ttl_seconds, jitter_ratio=jitter_ratio)
    try:
        client.setex(key, effective_ttl, raw_value)
        return True
    except (RedisError, OSError) as exc:
        mark_redis_unavailable(exc, settings)
        return False


def cache_delete(*keys: str, settings: Settings | None = None) -> None:
    clean_keys = [k for k in keys if k]
    if not clean_keys:
        return
    client = get_redis_client(settings)
    if client is None:
        return
    try:
        client.delete(*clean_keys)
    except (RedisError, OSError) as exc:
        mark_redis_unavailable(exc, settings)


def _release_stampede_lock(client: Any, lock_key: str, lock_token: str) -> None:
    """Release lock only if still owned by this caller (`lock_token` match)."""
    try:
        current = client.get(lock_key)
        if current == lock_token:
            client.delete(lock_key)
    except Exception:
        pass


def cache_get_or_set(
    key: str,
    *,
    ttl_seconds: int,
    loader: Callable[[], T],
    type_adapter: TypeAdapter[T] | None = None,
    jitter_ratio: float = 0.10,
    use_stampede_lock: bool = True,
    lock_ttl_ms: int = 3000,
    settings: Settings | None = None,
) -> T:
    """Read-through cache helper with single-flight stampede lock and DB fallback."""
    client = get_redis_client(settings)
    if client is None:
        return loader()

    try:
        cached_raw = client.get(key)
        if cached_raw is not None:
            try:
                return deserialize_value(cached_raw, type_adapter=type_adapter)
            except Exception:
                # Corrupt/outdated entry: evict and recompute cleanly from MySQL
                client.delete(key)
    except (RedisError, OSError) as exc:
        mark_redis_unavailable(exc, settings)
        return loader()

    lock_acquired = False
    lock_key = ""
    lock_token = ""

    if use_stampede_lock:
        key_digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:20]
        lock_key = build_key("lock", key_digest, settings=settings)
        lock_token = uuid.uuid4().hex
        try:
            lock_acquired = bool(client.set(lock_key, lock_token, nx=True, px=lock_ttl_ms))
            if not lock_acquired:
                # Another worker is populating this key right now; wait briefly
                for _ in range(5):
                    time.sleep(0.04)
                    waited_raw = client.get(key)
                    if waited_raw is not None:
                        try:
                            return deserialize_value(waited_raw, type_adapter=type_adapter)
                        except Exception:
                            break
        except (RedisError, OSError) as exc:
            mark_redis_unavailable(exc, settings)
            return loader()

    try:
        fresh_value = loader()
        try:
            serialized = serialize_value(fresh_value, type_adapter=type_adapter)
            effective_ttl = apply_ttl_jitter(ttl_seconds, jitter_ratio=jitter_ratio)
            active_client = get_redis_client(settings)
            if active_client is not None:
                active_client.setex(key, effective_ttl, serialized)
        except (RedisError, OSError) as exc:
            mark_redis_unavailable(exc, settings)
        except Exception as exc:
            logger.debug("Skipped Redis cache_set for %s (%s)", key, type(exc).__name__)
        return fresh_value
    finally:
        if lock_acquired:
            _release_stampede_lock(client, lock_key, lock_token)


# ---------------------------------------------------------------------------
# Short-TTL RBAC Principal Cache & Admin Session JWT (`jti`) Revocation
# ---------------------------------------------------------------------------
def get_cached_principal_dict(
    auth_kind: str,
    subject_id: str,
    *,
    settings: Settings | None = None,
) -> dict[str, Any] | None:
    if not subject_id:
        return None
    key = build_key("auth", "principal", auth_kind, subject_id, settings=settings)
    raw = cache_get_raw(key, settings=settings)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        cache_delete(key, settings=settings)
        return None


def set_cached_principal_dict(
    auth_kind: str,
    subject_id: str,
    payload: dict[str, Any],
    *,
    settings: Settings | None = None,
) -> None:
    if not subject_id:
        return
    resolved = _resolve_settings(settings)
    key = build_key("auth", "principal", auth_kind, subject_id, settings=resolved)
    cache_set_raw(
        key,
        serialize_value(payload),
        ttl_seconds=int(resolved.redis_ttl_principal_seconds),
        jitter_ratio=0.0,
        settings=resolved,
    )


def invalidate_principal_cache(
    *,
    clerk_user_id: str | None = None,
    user_id: str | None = None,
    settings: Settings | None = None,
) -> None:
    """Evict cached RBAC principal entries immediately after role/account changes."""
    keys: list[str] = []
    if clerk_user_id:
        keys.append(build_key("auth", "principal", "clerk", clerk_user_id, settings=settings))
    if user_id:
        keys.append(build_key("auth", "principal", "admin", user_id, settings=settings))
    cache_delete(*keys, settings=settings)


def _prune_local_revoked(now: float) -> None:
    expired = [k for k, exp in _local_revoked_jtis.items() if exp <= now]
    for k in expired:
        _local_revoked_jtis.pop(k, None)


def revoke_admin_token_jti(
    jti: str | None,
    exp_timestamp: int | None,
    *,
    settings: Settings | None = None,
) -> bool:
    """Revoke an Admin HS256 JWT `jti` until its natural `exp` timestamp."""
    clean_jti = (jti or "").strip()
    if not clean_jti:
        return False
    now = time.time()
    resolved = _resolve_settings(settings)
    fallback_exp = int(now + int(resolved.admin_session_ttl_seconds))
    exp_ts = int(exp_timestamp) if exp_timestamp else fallback_exp
    remaining_ttl = max(1, int(exp_ts - now) + 30)  # +30s covers JWT clock leeway

    with _local_revoked_lock:
        _prune_local_revoked(now)
        _local_revoked_jtis[clean_jti] = now + remaining_ttl

    key = build_key("auth", "revoked_jti", clean_jti, settings=resolved)
    cache_set_raw(key, "1", ttl_seconds=remaining_ttl, settings=resolved)
    return True


def is_admin_token_revoked(
    jti: str | None,
    *,
    settings: Settings | None = None,
) -> bool:
    """Return True if an Admin JWT `jti` was explicitly signed out / revoked."""
    clean_jti = (jti or "").strip()
    if not clean_jti:
        return False

    now = time.time()
    with _local_revoked_lock:
        _prune_local_revoked(now)
        if clean_jti in _local_revoked_jtis:
            return True

    key = build_key("auth", "revoked_jti", clean_jti, settings=settings)
    return cache_get_raw(key, settings=settings) is not None


def clear_local_revoked_jtis() -> None:
    """Clear local fallback revocation map (used in isolated tests)."""
    with _local_revoked_lock:
        _local_revoked_jtis.clear()
