"""Typed application settings loaded from environment variables (never hardcoded)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = Field(default="development")
    app_name: str = Field(default="HunarLink API")
    api_v1_prefix: str = Field(default="/api/v1")
    debug: bool = Field(default=False)

    # Explicit CORS & Host allowlists (never wildcard in production)
    cors_allowed_origins: str = Field(
        default=(
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:5174,http://127.0.0.1:5174,"
            "http://localhost:5175,http://127.0.0.1:5175,"
            "http://localhost:4173,http://127.0.0.1:4173"
        )
    )
    trusted_hosts: str = Field(default="localhost,127.0.0.1,testserver")
    frontend_base_url: str = Field(default="http://localhost:5173")

    # MySQL 8.4 LTS connection parts
    mysql_host: str = Field(default="127.0.0.1")
    mysql_port: int = Field(default=3306)
    mysql_database: str = Field(default="hunarlink")
    mysql_user: str = Field(default="hunarlink_app")
    mysql_password: SecretStr = Field(default=SecretStr(""))
    mysql_charset: str = Field(default="utf8mb4")
    database_url: str = Field(default="")
    auto_seed_catalog: bool = Field(default=True)

    # Clerk authentication (identity only)
    clerk_issuer: str = Field(default="")
    clerk_jwks_url: str = Field(default="")
    clerk_audience: str = Field(default="")
    clerk_webhook_secret: SecretStr = Field(default=SecretStr(""))

    # Dedicated Admin Email+Password JWT signing secret (HS256; never hardcode in prod)
    admin_jwt_secret: SecretStr = Field(default=SecretStr(""))
    admin_session_ttl_seconds: int = Field(default=28800, ge=300, le=86400)

    # Razorpay Standard Checkout (India / INR initial release)
    razorpay_mode: str = Field(default="test")
    razorpay_key_id: str = Field(default="")
    razorpay_key_secret: SecretStr = Field(default=SecretStr(""))
    razorpay_webhook_secret: SecretStr = Field(default=SecretStr(""))
    razorpay_currency: str = Field(default="INR")
    razorpay_timeout_seconds: int = Field(default=15, ge=2, le=60)

    # Private document storage & ASIGS file security
    private_storage_dir: str = Field(default="./var/private_uploads")
    max_upload_size_bytes: int = Field(default=5 * 1024 * 1024, ge=1024)
    malware_scanner_mode: str = Field(default="disabled")

    # GI LLM provider interface (kept behind provider abstraction)
    gi_llm_provider: str = Field(default="disabled")
    gi_reference_dataset_version: str = Field(default="unconfigured")

    # CraftProof AI & Local Ollama Gateway (provider-agnostic: ollama | groq | gemini | fallback)
    ai_provider: str = Field(default="ollama")
    ollama_base_url: str = Field(default="http://127.0.0.1:11434")
    ollama_model: str = Field(default="qwen2.5:3b")
    ai_timeout_seconds: int = Field(default=20, ge=3, le=90)
    groq_api_key: SecretStr = Field(default=SecretStr(""))
    groq_model: str = Field(default="llama-3.3-70b-versatile")
    gemini_api_key: SecretStr = Field(default=SecretStr(""))
    gemini_model: str = Field(default="gemini-2.0-flash-lite")

    # Redis Cache, Admin Session Revocation & Distributed Rate Limiting
    # MySQL is always authoritative; Redis degrades gracefully when unavailable.
    redis_enabled: bool = Field(default=True)
    redis_url: str = Field(default="")
    redis_host: str = Field(default="127.0.0.1")
    redis_port: int = Field(default=6379, ge=1, le=65535)
    redis_db: int = Field(default=0, ge=0, le=15)
    redis_password: SecretStr = Field(default=SecretStr(""))
    redis_ssl: bool = Field(default=False)
    redis_key_prefix: str = Field(default="hl")
    redis_socket_timeout_seconds: float = Field(default=0.5, ge=0.05, le=10.0)
    redis_circuit_cooldown_seconds: float = Field(default=15.0, ge=1.0, le=300.0)

    # Redis domain TTLs (seconds)
    redis_ttl_catalog_list_seconds: int = Field(default=300, ge=5)
    redis_ttl_catalog_detail_seconds: int = Field(default=600, ge=5)
    redis_ttl_artisans_list_seconds: int = Field(default=300, ge=5)
    redis_ttl_artisan_detail_seconds: int = Field(default=600, ge=5)
    redis_ttl_passport_seconds: int = Field(default=600, ge=5)
    redis_ttl_passport_lookup_seconds: int = Field(default=180, ge=5)
    redis_ttl_passport_qr_seconds: int = Field(default=86400, ge=60)
    redis_ttl_principal_seconds: int = Field(default=45, ge=5, le=300)
    redis_ttl_readyz_counts_seconds: int = Field(default=30, ge=5)
    redis_ttl_ai_status_seconds: int = Field(default=30, ge=5)
    redis_ttl_admin_overview_seconds: int = Field(default=15, ge=5)

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def trusted_hosts_list(self) -> List[str]:
        return [h.strip() for h in self.trusted_hosts.split(",") if h.strip()]

    @property
    def private_storage_path(self) -> Path:
        return Path(self.private_storage_dir).resolve()

    def build_mysql_url(self) -> URL:
        """Build a safe SQLAlchemy MySQL URL even when passwords contain special chars."""
        return URL.create(
            drivername="mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password.get_secret_value(),
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database,
            query={"charset": self.mysql_charset},
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
