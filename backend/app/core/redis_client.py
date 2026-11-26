"""Centralized Redis client, connection pool & circuit-breaker resilience layer.

Design principles:
  1. Never hardcode connection URLs or passwords — all configuration comes from
     `app.core.config.Settings` (environment variables / `backend/.env`).
  2. MySQL is ALWAYS the primary source of truth. If Redis is disabled, offline,
     or experiences a transient network error, callers receive `None` and fall
     back transparently to MySQL / in-process structures with zero HTTP 500s.
  3. An in-process circuit breaker (`redis_circuit_cooldown_seconds`, default 15s)
     prevents socket-timeout latency amplification when Redis is not running in
     local development or suffers an outage.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any

from redis import ConnectionPool, Redis
from redis.exceptions import RedisError

from app.core.config import Settings, get_settings

logger = logging.getLogger("hunarlink.redis")

_lock = threading.Lock()
_configured_settings: Settings | None = None
_pool: ConnectionPool | None = None
_client: Redis | None = None
_client_verified: bool = False
_client_signature: tuple[Any, ...] | None = None
_client_override: Any | None = None
_circuit_open_until: float = 0.0
_last_warning_at: float = 0.0


def _resolve_settings(settings: Settings | None = None) -> Settings:
    if settings is not None:
        return settings
    if _configured_settings is not None:
        return _configured_settings
    return get_settings()


def _settings_signature(settings: Settings) -> tuple[Any, ...]:
    return (
        bool(settings.redis_enabled),
        (settings.redis_url or "").strip(),
        settings.redis_host,
        int(settings.redis_port),
        int(settings.redis_db),
        settings.redis_password.get_secret_value(),
        bool(settings.redis_ssl),
        float(settings.redis_socket_timeout_seconds),
    )


def configure_redis(settings: Settings) -> None:
    """Bind the active application `Settings` (including `create_app` overrides)."""
    global _configured_settings, _pool, _client, _client_verified, _client_signature, _circuit_open_until
    with _lock:
        new_sig = _settings_signature(settings)
        _configured_settings = settings
        if _client_signature is not None and _client_signature != new_sig:
            _close_unlocked()
            _circuit_open_until = 0.0


def set_redis_client_override(client: Any | None) -> None:
    """Inject a test Redis client (e.g. `fakeredis.FakeRedis`) or clear override."""
    global _client_override, _circuit_open_until
    with _lock:
        _client_override = client
        _circuit_open_until = 0.0


def _close_unlocked() -> None:
    global _pool, _client, _client_verified, _client_signature
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
    if _pool is not None:
        try:
            _pool.disconnect()
        except Exception:
            pass
    _client = None
    _pool = None
    _client_verified = False
    _client_signature = None


def close_redis_client() -> None:
    """Close active Redis connection pool cleanly during application shutdown."""
    with _lock:
        _close_unlocked()


def reset_redis_state() -> None:
    """Reset client, override, and circuit breaker state (used in isolated tests)."""
    global _configured_settings, _client_override, _circuit_open_until, _last_warning_at
    with _lock:
        _close_unlocked()
        _configured_settings = None
        _client_override = None
        _circuit_open_until = 0.0
        _last_warning_at = 0.0


def mark_redis_unavailable(exc: BaseException, settings: Settings | None = None) -> None:
    """Trip the short circuit breaker so subsequent requests skip dead-socket waits."""
    global _circuit_open_until, _client_verified, _last_warning_at
    resolved = _resolve_settings(settings)
    cooldown = max(1.0, float(resolved.redis_circuit_cooldown_seconds))
    now = time.monotonic()
    with _lock:
        _circuit_open_until = now + cooldown
        _client_verified = False
        should_log = (now - _last_warning_at) >= cooldown
        if should_log:
            _last_warning_at = now
    if should_log:
        logger.warning(
            "Redis unavailable (%s); falling back to MySQL / in-memory state for %.0fs.",
            type(exc).__name__,
            cooldown,
        )


def _build_client_unlocked(settings: Settings) -> Redis:
    global _pool, _client, _client_signature
    timeout = float(settings.redis_socket_timeout_seconds)
    raw_url = (settings.redis_url or "").strip()
    if raw_url:
        _pool = ConnectionPool.from_url(
            raw_url,
            decode_responses=True,
            socket_timeout=timeout,
            socket_connect_timeout=timeout,
            health_check_interval=30,
            max_connections=32,
        )
    else:
        password = settings.redis_password.get_secret_value() or None
        conn_kwargs: dict[str, Any] = {
            "host": settings.redis_host,
            "port": int(settings.redis_port),
            "db": int(settings.redis_db),
            "password": password,
            "decode_responses": True,
            "socket_timeout": timeout,
            "socket_connect_timeout": timeout,
            "health_check_interval": 30,
            "max_connections": 32,
        }
        if settings.redis_ssl:
            from redis.connection import SSLConnection

            conn_kwargs["connection_class"] = SSLConnection
        _pool = ConnectionPool(**conn_kwargs)

    _client = Redis(connection_pool=_pool)
    _client_signature = _settings_signature(settings)
    return _client


def get_redis_client(settings: Settings | None = None) -> Any | None:
    """Return a healthy Redis client, or `None` if disabled or circuit-broken."""
    global _client_verified, _circuit_open_until

    if _client_override is not None:
        if time.monotonic() < _circuit_open_until:
            return None
        return _client_override

    resolved = _resolve_settings(settings)
    if not resolved.redis_enabled:
        return None

    now = time.monotonic()
    if now < _circuit_open_until:
        return None

    need_verify = False
    with _lock:
        if now < _circuit_open_until:
            return None
        sig = _settings_signature(resolved)
        if _client is None or _client_signature != sig:
            _close_unlocked()
            client = _build_client_unlocked(resolved)
            need_verify = True
        else:
            client = _client
            need_verify = not _client_verified

    if need_verify:
        try:
            client.ping()
            with _lock:
                _client_verified = True
                _circuit_open_until = 0.0
        except (RedisError, OSError) as exc:
            mark_redis_unavailable(exc, resolved)
            return None

    return client


def probe_redis_health(settings: Settings | None = None) -> dict[str, Any]:
    """Safe non-sensitive Redis status probe for `/readyz`."""
    resolved = _resolve_settings(settings)
    if _client_override is None and not resolved.redis_enabled:
        return {"enabled": False, "status": "disabled"}

    client = get_redis_client(resolved)
    if client is None:
        return {"enabled": True, "status": "unavailable"}

    try:
        ok = bool(client.ping())
        return {"enabled": True, "status": "connected" if ok else "unavailable"}
    except (RedisError, OSError) as exc:
        mark_redis_unavailable(exc, resolved)
        return {"enabled": True, "status": "unavailable"}
