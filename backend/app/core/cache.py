"""MySQL-direct cache layer — Redis removed.

All read paths now hit MySQL directly so Workbench DELETEs reflect
instantly. The previous Redis API is preserved as no-ops so routers
don't need import changes.

Architectural rules:
  1. MySQL is the single source of truth.
  2. No caching — every request runs loader() directly.
  3. Invalidation helpers are no-ops (kept for backward compat).
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable, TypeVar

from pydantic import BaseModel, TypeAdapter

from app.core.config import Settings, get_settings

logger = logging.getLogger("hunarlink.cache")

T = TypeVar("T")

# Bounded in-process store for revoked Admin JWT jtis (MySQL-direct, no Redis)
_local_revoked_lock = threading.Lock()
_local_revoked_jtis: dict[str, float] = {}


def _resolve_settings(settings: Settings | None = None) -> Settings:
    return settings if settings is not None else get_settings()


def _clean_segment(part: str) -> str:
    return str(part).strip().replace(" ", "_")


def build_key(*parts: str, settings: Settings | None = None) -> str:  # noqa: ARG001
    """Build a namespaced key `<prefix>:<part1>:<part2>...` (kept for compat)."""
    resolved = _resolve_settings(settings)
    prefix = "hl"
    cleaned = [_clean_segment(p) for p in parts if str(p).strip()]
    return ":".join([prefix, *cleaned])


def hash_query_fragment(raw: str) -> str:
    normalized = (raw or "").strip().lower().encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()[:24]


def apply_ttl_jitter(base_ttl: int, jitter_ratio: float = 0.10) -> int:  # noqa: ARG001
    return max(1, int(base_ttl))


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
# Versioning — no-op (kept for compat, always 1)
# ---------------------------------------------------------------------------
def get_namespace_version(domain: str, settings: Settings | None = None) -> int:  # noqa: ARG001
    return 1


def bump_namespace_version(*domains: str, settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


def invalidate_catalog_cache(settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


def invalidate_artisan_cache(settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


def invalidate_passport_cache(settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


def invalidate_admin_overview_cache(settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


# ---------------------------------------------------------------------------
# Direct MySQL — no Redis
# ---------------------------------------------------------------------------
def cache_get_raw(key: str, *, settings: Settings | None = None) -> str | None:  # noqa: ARG001
    return None


def cache_set_raw(
    key: str,
    raw_value: str,
    *,
    ttl_seconds: int,
    jitter_ratio: float = 0.0,
    settings: Settings | None = None,
) -> bool:  # noqa: ARG001
    return False


def cache_delete(*keys: str, settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


def cache_get_or_set(
    key: str,
    *,
    ttl_seconds: int,
    loader: Callable[[], T],
    type_adapter: TypeAdapter[T] | None = None,  # noqa: ARG001
    jitter_ratio: float = 0.10,  # noqa: ARG001
    use_stampede_lock: bool = True,  # noqa: ARG001
    lock_ttl_ms: int = 3000,  # noqa: ARG001
    settings: Settings | None = None,  # noqa: ARG001
) -> T:
    """MySQL-direct: always run loader(), no caching."""
    return loader()


# ---------------------------------------------------------------------------
# Short-TTL RBAC Principal Cache & Admin Session JWT (jti) Revocation — in-memory only
# ---------------------------------------------------------------------------
def get_cached_principal_dict(
    auth_kind: str,
    subject_id: str,
    *,
    settings: Settings | None = None,
) -> dict[str, Any] | None:  # noqa: ARG001
    return None


def set_cached_principal_dict(
    auth_kind: str,
    subject_id: str,
    payload: dict[str, Any],
    *,
    settings: Settings | None = None,
) -> None:  # noqa: ARG001
    return None


def invalidate_principal_cache(
    *,
    clerk_user_id: str | None = None,
    user_id: str | None = None,
    settings: Settings | None = None,
) -> None:  # noqa: ARG001
    return None


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
    clean_jti = (jti or "").strip()
    if not clean_jti:
        return False
    now = time.time()
    resolved = _resolve_settings(settings)
    fallback_exp = int(now + int(resolved.admin_session_ttl_seconds))
    exp_ts = int(exp_timestamp) if exp_timestamp else fallback_exp
    remaining_ttl = max(1, int(exp_ts - now) + 30)
    with _local_revoked_lock:
        _prune_local_revoked(now)
        _local_revoked_jtis[clean_jti] = now + remaining_ttl
    return True


def is_admin_token_revoked(
    jti: str | None,
    *,
    settings: Settings | None = None,  # noqa: ARG001
) -> bool:
    clean_jti = (jti or "").strip()
    if not clean_jti:
        return False
    now = time.time()
    with _local_revoked_lock:
        _prune_local_revoked(now)
        if clean_jti in _local_revoked_jtis:
            return True
    return False


def clear_local_revoked_jtis() -> None:
    with _local_revoked_lock:
        _local_revoked_jtis.clear()
