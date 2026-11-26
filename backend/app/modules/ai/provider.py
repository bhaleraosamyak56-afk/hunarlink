"""Provider-agnostic AI Gateway: Local Ollama (primary) + Optional Cloud (Groq/Gemini) + Safe Fallback.

Designed for RTX 4050 6 GB (`qwen2.5:3b` default):
  - Native Ollama JSON-schema constrained decoding (`format` parameter)
  - Strict timeouts (`settings.ai_timeout_seconds`) so the UI never hangs
  - Zero-crash graceful fallback when Ollama is offline (e.g. CI / sandbox / non-GPU machines)
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import Settings

logger = logging.getLogger("hunarlink.ai")


@dataclass(frozen=True)
class AIGenerationResult:
    ok: bool
    provider_used: str
    model_used: str
    latency_ms: int
    raw_text: str | None = None
    parsed_json: dict[str, Any] | None = None
    error: str | None = None


def _extract_json_object(text: str) -> dict[str, Any] | None:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    # Strip markdown code fences if a cloud provider adds them
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        obj = json.loads(cleaned)
        return obj if isinstance(obj, dict) else None
    except Exception:
        pass
    m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


class LocalAIGateway:
    """Thin HTTP gateway supporting Ollama (local), Groq, and Gemini with strict timeouts."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.provider = (settings.ai_provider or "ollama").strip().lower()
        self.timeout = float(settings.ai_timeout_seconds)

    def probe_status(self) -> dict[str, Any]:
        """Inspect local Ollama reachability and installed models without crashing."""
        info: dict[str, Any] = {
            "configured_provider": self.provider,
            "configured_model": self._active_model_name(),
            "ollama_base_url": self.settings.ollama_base_url,
            "ollama_reachable": False,
            "installed_models": [],
            "recommended_model_present": False,
            "fallback_ready": True,
        }
        if self.provider != "ollama":
            info["cloud_key_configured"] = bool(
                self.settings.groq_api_key.get_secret_value()
                if self.provider == "groq"
                else self.settings.gemini_api_key.get_secret_value()
            )
            return info

        try:
            url = f"{self.settings.ollama_base_url.rstrip('/')}/api/tags"
            with httpx.Client(timeout=2.0) as client:
                res = client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
                    info["ollama_reachable"] = True
                    info["installed_models"] = models
                    target = self.settings.ollama_model
                    info["recommended_model_present"] = any(
                        m == target or m.startswith(f"{target}:") for m in models
                    )
        except Exception as exc:
            info["probe_note"] = f"Ollama offline or unreachable ({type(exc).__name__}); deterministic fallback active."
        return info

    def _active_model_name(self) -> str:
        if self.provider == "groq":
            return self.settings.groq_model
        if self.provider == "gemini":
            return self.settings.gemini_model
        return self.settings.ollama_model

    def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        temperature: float = 0.1,
    ) -> AIGenerationResult:
        """Request strict JSON output matching `json_schema` from configured provider."""
        t0 = time.perf_counter()
        if self.provider == "fallback":
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=0,
                error="AI provider explicitly set to deterministic fallback.",
            )

        if self.provider == "ollama":
            return self._call_ollama(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_schema=json_schema,
                temperature=temperature,
                t0=t0,
            )
        if self.provider == "groq":
            return self._call_groq(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                expect_json=True,
                t0=t0,
            )
        if self.provider == "gemini":
            return self._call_gemini(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                expect_json=True,
                t0=t0,
            )
        return AIGenerationResult(
            ok=False,
            provider_used="deterministic_fallback",
            model_used="rules-v1",
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=f"Unsupported AI_PROVIDER '{self.provider}'.",
        )

    def generate_text(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> AIGenerationResult:
        """Request grounded plain-text explanation from configured provider."""
        t0 = time.perf_counter()
        if self.provider == "fallback":
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=0,
                error="AI provider set to deterministic fallback.",
            )
        if self.provider == "ollama":
            return self._call_ollama(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                json_schema=None,
                temperature=temperature,
                t0=t0,
            )
        if self.provider == "groq":
            return self._call_groq(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                expect_json=False,
                t0=t0,
            )
        if self.provider == "gemini":
            return self._call_gemini(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                expect_json=False,
                t0=t0,
            )
        return AIGenerationResult(
            ok=False,
            provider_used="deterministic_fallback",
            model_used="rules-v1",
            latency_ms=int((time.perf_counter() - t0) * 1000),
            error=f"Unsupported AI_PROVIDER '{self.provider}'.",
        )

    def _call_ollama(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any] | None,
        temperature: float,
        t0: float,
    ) -> AIGenerationResult:
        model = self.settings.ollama_model
        url = f"{self.settings.ollama_base_url.rstrip('/')}/api/chat"
        body: dict[str, Any] = {
            "model": model,
            "stream": False,
            "keep_alive": "30m",
            "options": {
                "temperature": temperature,
                "num_ctx": 4096,
            },
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if json_schema is not None:
            body["format"] = json_schema

        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(url, json=body)
                elapsed = int((time.perf_counter() - t0) * 1000)
                if res.status_code != 200:
                    return AIGenerationResult(
                        ok=False,
                        provider_used="deterministic_fallback",
                        model_used="rules-v1",
                        latency_ms=elapsed,
                        error=f"Ollama HTTP {res.status_code}",
                    )
                content = str(res.json().get("message", {}).get("content", "")).strip()
                if json_schema is not None:
                    parsed = _extract_json_object(content)
                    if parsed is None:
                        return AIGenerationResult(
                            ok=False,
                            provider_used="deterministic_fallback",
                            model_used="rules-v1",
                            latency_ms=elapsed,
                            raw_text=content,
                            error="Ollama returned non-JSON output.",
                        )
                    return AIGenerationResult(
                        ok=True,
                        provider_used="ollama",
                        model_used=model,
                        latency_ms=elapsed,
                        raw_text=content,
                        parsed_json=parsed,
                    )
                return AIGenerationResult(
                    ok=bool(content),
                    provider_used="ollama" if content else "deterministic_fallback",
                    model_used=model if content else "rules-v1",
                    latency_ms=elapsed,
                    raw_text=content,
                )
        except Exception as exc:
            elapsed = int((time.perf_counter() - t0) * 1000)
            logger.info("Ollama unavailable (%s); falling back to deterministic engine.", type(exc).__name__)
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=elapsed,
                error=f"Ollama unreachable: {type(exc).__name__}",
            )

    def _call_groq(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        expect_json: bool,
        t0: float,
    ) -> AIGenerationResult:
        api_key = self.settings.groq_api_key.get_secret_value().strip()
        if not api_key:
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=0,
                error="GROQ_API_KEY is not configured.",
            )
        model = self.settings.groq_model
        body: dict[str, Any] = {
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if expect_json:
            body["response_format"] = {"type": "json_object"}
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=body,
                )
                elapsed = int((time.perf_counter() - t0) * 1000)
                if res.status_code != 200:
                    return AIGenerationResult(
                        ok=False,
                        provider_used="deterministic_fallback",
                        model_used="rules-v1",
                        latency_ms=elapsed,
                        error=f"Groq HTTP {res.status_code}",
                    )
                content = str(res.json()["choices"][0]["message"]["content"]).strip()
                if expect_json:
                    parsed = _extract_json_object(content)
                    if parsed is None:
                        return AIGenerationResult(
                            ok=False,
                            provider_used="deterministic_fallback",
                            model_used="rules-v1",
                            latency_ms=elapsed,
                            error="Groq returned invalid JSON.",
                        )
                    return AIGenerationResult(
                        ok=True,
                        provider_used="groq",
                        model_used=model,
                        latency_ms=elapsed,
                        raw_text=content,
                        parsed_json=parsed,
                    )
                return AIGenerationResult(
                    ok=bool(content),
                    provider_used="groq",
                    model_used=model,
                    latency_ms=elapsed,
                    raw_text=content,
                )
        except Exception as exc:
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=f"Groq request failed: {type(exc).__name__}",
            )

    def _call_gemini(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        expect_json: bool,
        t0: float,
    ) -> AIGenerationResult:
        api_key = self.settings.gemini_api_key.get_secret_value().strip()
        if not api_key:
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=0,
                error="GEMINI_API_KEY is not configured.",
            )
        model = self.settings.gemini_model
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={api_key}"
        )
        gen_cfg: dict[str, Any] = {"temperature": temperature}
        if expect_json:
            gen_cfg["responseMimeType"] = "application/json"
        body = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": gen_cfg,
        }
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(url, json=body)
                elapsed = int((time.perf_counter() - t0) * 1000)
                if res.status_code != 200:
                    return AIGenerationResult(
                        ok=False,
                        provider_used="deterministic_fallback",
                        model_used="rules-v1",
                        latency_ms=elapsed,
                        error=f"Gemini HTTP {res.status_code}",
                    )
                candidates = res.json().get("candidates") or []
                content = ""
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    content = "".join(str(p.get("text", "")) for p in parts).strip()
                if expect_json:
                    parsed = _extract_json_object(content)
                    if parsed is None:
                        return AIGenerationResult(
                            ok=False,
                            provider_used="deterministic_fallback",
                            model_used="rules-v1",
                            latency_ms=elapsed,
                            error="Gemini returned invalid JSON.",
                        )
                    return AIGenerationResult(
                        ok=True,
                        provider_used="gemini",
                        model_used=model,
                        latency_ms=elapsed,
                        raw_text=content,
                        parsed_json=parsed,
                    )
                return AIGenerationResult(
                    ok=bool(content),
                    provider_used="gemini",
                    model_used=model,
                    latency_ms=elapsed,
                    raw_text=content,
                )
        except Exception as exc:
            return AIGenerationResult(
                ok=False,
                provider_used="deterministic_fallback",
                model_used="rules-v1",
                latency_ms=int((time.perf_counter() - t0) * 1000),
                error=f"Gemini request failed: {type(exc).__name__}",
            )
