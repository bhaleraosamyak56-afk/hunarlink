"""Stub Redis client — Redis has been removed from HunarLink.

MySQL is the single source of truth. Workbench DELETEs now reflect
instantly on next request with no cache layer.

This stub keeps old import paths importable so existing modules don't
break during the transition. All functions return None/disabled.
"""

from __future__ import annotations

from typing import Any

from app.core.config import Settings, get_settings


def _resolve_settings(settings: Settings | None = None) -> Settings:
    return settings if settings is not None else get_settings()


def configure_redis(settings: Settings) -> None:  # noqa: ARG001
    return None


def set_redis_client_override(client: Any | None) -> None:  # noqa: ARG001
    return None


def close_redis_client() -> None:
    return None


def reset_redis_state() -> None:
    return None


def mark_redis_unavailable(exc: BaseException, settings: Settings | None = None) -> None:  # noqa: ARG001
    return None


def get_redis_client(settings: Settings | None = None) -> Any | None:  # noqa: ARG001
    return None


def probe_redis_health(settings: Settings | None = None) -> dict[str, Any]:  # noqa: ARG001
    return {"enabled": False, "status": "disabled"}
