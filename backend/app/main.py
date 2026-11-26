"""HunarLink FastAPI Backend Application Entrypoint.

Wires together:
  - Strict CORS allowlist (never `*` with credentials)
  - Security headers + request correlation ID middleware
  - ASIGS Advanced Seller Input Guardrail System (`/api/v1/...`)
  - Razorpay Standard Checkout, Webhooks, Refunds, Admin Ops (`/api/v1/...`)
  - Safe health endpoints (`/healthz`, `/readyz`) with zero secret exposure
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, func, inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db, get_engine, get_session_factory
from app.core.security import CorrelationAndHeadersMiddleware
from app.models.base import Base
from app.models.core_models import SellerProductListing
from app.modules.auth.router import router as auth_router
from app.modules.ai.router import router as ai_router
from app.modules.craftproof.router import router as craftproof_router
from app.modules.demand_bridge.router import router as demand_bridge_router
from app.modules.guardrails.router import router as guardrails_router
from app.modules.payments.router import router as payments_router
from app.modules.payments.webhook_router import webhook_router as razorpay_webhook_router
from app.modules.storefront.router import router as storefront_router

logger = logging.getLogger("hunarlink.backend")


def _ensure_missing_orm_columns(engine: Engine) -> int:
    """Safely add any columns added in later ORM revisions to pre-existing SQLite/MySQL tables."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    added = 0
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        present_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name in present_cols or col.primary_key:
                continue
            col_type_sql = col.type.compile(dialect=engine.dialect)
            default_clause = ""
            if not col.nullable and col.name in {"average_rating", "total_reviews", "is_active"}:
                default_clause = " DEFAULT 0"
            ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type_sql}{default_clause}'
            if engine.dialect.name == "mysql":
                ddl = f"ALTER TABLE `{table.name}` ADD COLUMN `{col.name}` {col_type_sql} NULL"
            with engine.begin() as conn:
                conn.execute(text(ddl))
            added += 1
            logger.info("Auto-migrated missing column %s.%s (%s)", table.name, col.name, col_type_sql)
    return added


def _bootstrap_dev_catalog_if_empty(settings: Settings) -> None:
    """In development mode, ensure schema & full 53-artisan / 96-listing heritage catalog exist."""
    if settings.app_env != "development" or not settings.auto_seed_catalog:
        return
    try:
        import app.models.core_models  # noqa: F401
        import app.models.guardrail_models  # noqa: F401
        import app.models.craftproof_models  # noqa: F401

        engine = get_engine()
        Base.metadata.create_all(bind=engine, checkfirst=True)
        _ensure_missing_orm_columns(engine)
        with get_session_factory()() as db:
            active_count = int(
                db.scalar(
                    select(func.count(SellerProductListing.id)).where(
                        SellerProductListing.listing_status == "ACTIVE"
                    )
                )
                or 0
            )
            if active_count >= 96:
                return
            backend_root = Path(__file__).resolve().parents[1]
            if str(backend_root) not in sys.path:
                sys.path.insert(0, str(backend_root))
            from scripts.seed_real_artisans import seed_artisans_and_catalog
            from app.modules.guardrails.repository import ensure_default_guardrail_rules

            stats = seed_artisans_and_catalog(session_override=db)
            ensure_default_guardrail_rules(db)
            db.commit()
            logger.info(
                "Seeded %s development DB to full catalog (%d artisans, %d active listings).",
                engine.dialect.name,
                stats["total_artisans"],
                stats["total_products"],
            )
    except Exception as exc:
        logger.warning(
            "Dev catalog bootstrap skipped (%s: %s) — verify MYSQL_* / DATABASE_URL in backend/.env.",
            type(exc).__name__,
            exc,
        )


def create_app(settings_override: Settings | None = None) -> FastAPI:
    settings = settings_override or get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        _bootstrap_dev_catalog_if_empty(settings)
        yield

    application = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url="/redoc" if settings.app_env != "production" else None,
        openapi_url="/openapi.json" if settings.app_env != "production" else None,
    )

    if settings_override is not None:
        application.dependency_overrides[get_settings] = lambda: settings_override

    application.add_middleware(
        CorrelationAndHeadersMiddleware,
        allow_dev_iframe=(settings.app_env == "development"),
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=(
            r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
            if settings.app_env != "production"
            else None
        ),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Correlation-ID",
            "X-Idempotency-Key",
            "X-Razorpay-Signature",
            "x-razorpay-event-id",
        ],
    )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        corr_id = getattr(request.state, "correlation_id", "unknown")
        logger.error("Unhandled backend error [%s]: %s", corr_id, type(exc).__name__)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "An internal error occurred.",
                "correlation_id": corr_id,
            },
        )

    @application.get("/", tags=["Health"])
    def root() -> dict:
        return {
            "service": settings.app_name,
            "status": "ok",
            "environment": settings.app_env,
            "docs": "/docs" if settings.app_env != "production" else None,
            "healthz": "/healthz",
            "readyz": "/readyz",
            "api_prefix": settings.api_v1_prefix,
        }

    @application.get("/healthz", tags=["Health"])
    def healthz() -> dict:
        return {
            "status": "ok",
            "service": settings.app_name,
            "environment": settings.app_env,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @application.get("/readyz", tags=["Health"])
    def readyz(db: Session = Depends(get_db)) -> JSONResponse:
        db_connected = False
        dialect_name = None
        public_artisans = 0
        public_listings = 0
        try:
            db.execute(text("SELECT 1"))
            db_connected = True
            if db.bind is not None:
                dialect_name = db.bind.dialect.name
            public_artisans = int(
                db.execute(
                    text(
                        "SELECT COUNT(*) FROM seller_profiles sp "
                        "JOIN users u ON u.id = sp.user_id "
                        "WHERE u.account_status = 'ACTIVE' "
                        "AND sp.profile_status = 'ACTIVE' "
                        "AND sp.verification_status = 'APPROVED'"
                    )
                ).scalar()
                or 0
            )
            public_listings = int(
                db.execute(
                    text(
                        "SELECT COUNT(*) FROM seller_product_listings spl "
                        "JOIN products p ON p.id = spl.product_id "
                        "JOIN seller_profiles sp ON sp.id = spl.seller_profile_id "
                        "JOIN users u ON u.id = sp.user_id "
                        "WHERE spl.listing_status = 'ACTIVE' "
                        "AND p.is_active = 1 "
                        "AND p.approval_status = 'APPROVED' "
                        "AND u.account_status = 'ACTIVE' "
                        "AND sp.profile_status = 'ACTIVE' "
                        "AND sp.verification_status = 'APPROVED'"
                    )
                ).scalar()
                or 0
            )
        except Exception:
            logger.warning("Readiness probe could not reach configured database.")

        payload = {
            "status": "ready" if db_connected else "degraded",
            "database": "connected" if db_connected else "unavailable",
            "database_dialect": dialect_name,
            "public_artisans": public_artisans,
            "public_listings": public_listings,
            "clerk_configured": bool(
                (settings.clerk_issuer or "").strip() and (settings.clerk_jwks_url or "").strip()
            ),
            "gi_llm_provider": settings.gi_llm_provider,
            "malware_scanner_mode": settings.malware_scanner_mode,
            "razorpay_configured": bool(
                settings.razorpay_key_id and settings.razorpay_key_secret.get_secret_value()
            ),
        }
        return JSONResponse(
            status_code=status.HTTP_200_OK if db_connected else status.HTTP_503_SERVICE_UNAVAILABLE,
            content=payload,
        )

    application.include_router(auth_router, prefix=settings.api_v1_prefix)
    application.include_router(storefront_router, prefix=settings.api_v1_prefix)
    application.include_router(guardrails_router, prefix=settings.api_v1_prefix)
    application.include_router(payments_router, prefix=settings.api_v1_prefix)
    application.include_router(razorpay_webhook_router, prefix=settings.api_v1_prefix)
    application.include_router(craftproof_router, prefix=settings.api_v1_prefix)
    application.include_router(ai_router, prefix=settings.api_v1_prefix)
    application.include_router(demand_bridge_router, prefix=settings.api_v1_prefix)

    return application


app = create_app()
