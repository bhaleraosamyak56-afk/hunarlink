"""
FastAPI Backend Server for HunarSathi — Hardened HunarLink Buyer Chatbot.
Exposes:
  - POST /api/chat/stream  (Server-Sent Events live token streaming)
  - POST /api/chat         (Standard JSON response, hard-capped < 22s)
  - GET  /api/warmup       (Pre-warms Gemini HTTP client)
  - GET  /api/health       (Health & runtime speed stats)
  - POST /api/reset        (Clears buyer conversation history)

Security hardening (Workstream 4):
  - Strict CORS origin allowlist from HUNARSATHI_CORS_ORIGINS (no wildcard `*`)
  - Per-IP sliding-window rate limiting on chat & reset endpoints
  - Bounded LRU session memory (see chatbot.py MAX_ACTIVE_SESSIONS)
  - Defensive HTTP security headers & disabled Swagger docs in production
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from chatbot import (
    BOT_NAME,
    DEFAULT_MODEL,
    ask_hunarsathi,
    get_gemini_config,
    get_runtime_stats,
    local_hunarlink_reply,
    reset_session,
    stream_hunarsathi,
    warmup_client,
)

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

HARD_REQUEST_TIMEOUT_SEC = 22.0
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
RATE_LIMIT_PER_MIN = int(os.getenv("HUNARSATHI_RATE_LIMIT_PER_MIN", "30"))

_DEFAULT_ORIGINS = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "http://localhost:5174,"
    "http://127.0.0.1:5174,"
    "http://localhost:5175,"
    "http://127.0.0.1:5175,"
    "http://localhost:8123,"
    "http://127.0.0.1:8123,"
    "https://bhaleraosamyak56-afk.github.io"
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("HUNARSATHI_CORS_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip() and o.strip() != "*"
]


class _SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_requests:
                retry_after = max(1, int(bucket[0] + self.window_seconds - now))
                return False, retry_after
            bucket.append(now)
            return True, 0


_limiter = _SlidingWindowLimiter(max_requests=RATE_LIMIT_PER_MIN, window_seconds=60)


def _enforce_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    allowed, retry_after = _limiter.check(ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many chat requests; please pause briefly before trying again.",
            headers={"Retry-After": str(retry_after)},
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    warmup_client()
    yield


app = FastAPI(
    title="HunarSathi — HunarLink Fast Buyer Chatbot API",
    description="High-speed streaming Gemini Flash assistant restricted strictly to the HunarLink platform.",
    version="2.1.0",
    docs_url="/docs" if APP_ENV != "production" else None,
    redoc_url="/redoc" if APP_ENV != "production" else None,
    openapi_url="/openapi.json" if APP_ENV != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1200)
    session_id: str = Field(default="buyer-default", max_length=128)


class ResetRequest(BaseModel):
    session_id: str = Field(default="buyer-default", max_length=128)


@app.get("/api/health")
async def health_check():
    api_key, model_name = get_gemini_config()
    key_configured = bool(api_key and api_key != "GEMINI_API_KEY")
    stats = get_runtime_stats()
    return {
        "status": "ok",
        "bot": BOT_NAME,
        "model": (stats["active_models"][0] if stats["active_models"] else model_name or DEFAULT_MODEL),
        "gemini_key_configured": key_configured,
        "streaming": True,
        "cache_entries": stats["cache_entries"],
    }


@app.get("/api/warmup")
async def warmup_endpoint(request: Request):
    _enforce_rate_limit(request)
    info = await asyncio.to_thread(warmup_client)
    return {"status": "warm", "bot": BOT_NAME, **info}


@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest, request: Request):
    _enforce_rate_limit(request)
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(ask_hunarsathi, payload.message, payload.session_id),
            timeout=HARD_REQUEST_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        return {
            "bot": BOT_NAME,
            "model": "local-knowledge",
            "reply": local_hunarlink_reply(payload.message),
            "session_id": payload.session_id,
            "latency_ms": int(HARD_REQUEST_TIMEOUT_SEC * 1000),
            "cached": False,
        }
    except Exception:
        return {
            "bot": BOT_NAME,
            "model": "local-knowledge",
            "reply": local_hunarlink_reply(payload.message),
            "session_id": payload.session_id,
            "latency_ms": 0,
            "cached": False,
        }


@app.post("/api/chat/stream")
async def chat_stream_endpoint(payload: ChatRequest, request: Request):
    """Stream SSE events (`data: {"type":"chunk","text":"..."}\n\n`) for instant smooth UI."""
    _enforce_rate_limit(request)

    def event_generator():
        try:
            for evt in stream_hunarsathi(payload.message, payload.session_id):
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
        except Exception:
            fallback = local_hunarlink_reply(payload.message)
            yield f"data: {json.dumps({'type': 'chunk', 'text': fallback}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'reply': fallback, 'model': 'local-knowledge', 'latency_ms': 0, 'cached': False}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/reset")
async def reset_endpoint(payload: ResetRequest, request: Request):
    _enforce_rate_limit(request)
    reset_session(payload.session_id)
    return {"status": "reset", "bot": BOT_NAME, "session_id": payload.session_id}


if __name__ == "__main__":
    host = os.getenv("BIND_HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5050"))
    print(f"Starting {BOT_NAME} Hardened Streaming API on http://{host}:{port}")
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=False,
        timeout_keep_alive=30,
    )
