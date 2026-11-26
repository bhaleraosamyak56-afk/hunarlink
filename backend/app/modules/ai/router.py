"""FastAPI Router for CraftProof AI Services (Local Ollama + Provider-Agnostic Gateway)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import (
    AuthenticatedPrincipal,
    bearer_scheme,
    get_current_principal,
    get_token_verifier,
    load_admin_principal_by_user_id,
    load_principal_by_clerk_id,
    require_platform_role,
)
from app.core.admin_security import verify_admin_session_token
from app.core.cache import (
    build_key,
    cache_get_or_set,
    invalidate_passport_cache,
    is_admin_token_revoked,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import SlidingWindowRateLimiter
from app.models.core_models import SellerProfile
from app.models.craftproof_models import AIInteractionLog
from app.modules.ai.provider import LocalAIGateway
from app.modules.ai.schemas import (
    ArtisanCopilotDraftIn,
    ArtisanDocPreScreenIn,
    BuyerAssistantAskIn,
    CraftAuditListingIn,
)
from app.modules.ai.service import (
    answer_buyer_passport_question,
    audit_craft_listing,
    draft_artisan_listing,
    prescreen_artisan_document,
)

router = APIRouter(prefix="/ai", tags=["CraftProof AI"])
ai_rate_limiter = SlidingWindowRateLimiter(max_requests=20, window_seconds=60, scope="ai")


def _enforce_ai_rate_limit(request: Request, principal: AuthenticatedPrincipal | None) -> None:
    actor = principal.user_id if principal is not None else (request.client.host if request.client else "anon")
    allowed, retry_after = ai_rate_limiter.allow(f"ai:{actor}")
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"AI assistant rate limit exceeded. Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )


def _optional_principal(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedPrincipal | None:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        admin_claims = verify_admin_session_token(token, settings)
        if admin_claims is not None:
            if is_admin_token_revoked(admin_claims.get("jti"), settings=settings):
                return None
            return load_admin_principal_by_user_id(db, str(admin_claims["sub"]))
        verifier = get_token_verifier(settings)
        claims = verifier.verify(token)
        return load_principal_by_clerk_id(db, str(claims["sub"]))
    except Exception:
        return None


@router.get("/status")
def get_ai_gateway_status(settings: Settings = Depends(get_settings)) -> dict:
    """Inspect local Ollama reachability, active model (`qwen2.5:3b`), and fallback readiness."""
    status_key = build_key("cache", "ai", "status", settings=settings)
    return cache_get_or_set(
        status_key,
        ttl_seconds=settings.redis_ttl_ai_status_seconds,
        loader=lambda: LocalAIGateway(settings).probe_status(),
        jitter_ratio=0.0,
        use_stampede_lock=False,
        settings=settings,
    )


@router.post("/artisan-doc/prescreen")
def post_artisan_doc_prescreen(
    payload: ArtisanDocPreScreenIn,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 1A: Pre-screen uploaded GI Certificate / Artisan Card & pass advisory dossier to Admin."""
    _enforce_ai_rate_limit(request, principal)
    return prescreen_artisan_document(
        db,
        settings=settings,
        payload=payload,
        actor_user_id=principal.user_id,
    )


@router.post("/artisan-copilot/draft")
def post_artisan_copilot_draft(
    payload: ArtisanCopilotDraftIn,
    request: Request,
    principal: AuthenticatedPrincipal | None = Depends(_optional_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 2: Turn Hindi / Hinglish / English artisan voice/text notes into an editable listing + Fair-Craft breakdown."""
    _enforce_ai_rate_limit(request, principal)
    enriched = payload
    if principal is not None and (not payload.seller_district or not payload.seller_craft_specialty):
        seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == principal.user_id))
        if seller is not None:
            enriched = ArtisanCopilotDraftIn(
                raw_note=payload.raw_note,
                language_hint=payload.language_hint,
                seller_district=payload.seller_district or seller.workshop_district,
                seller_craft_specialty=payload.seller_craft_specialty or seller.craft_specialty,
            )
    return draft_artisan_listing(
        settings=settings,
        payload=enriched,
        db=db,
        actor_user_id=principal.user_id if principal else None,
    )


@router.post("/craft-audit/listing")
def post_craft_audit_listing(
    payload: CraftAuditListingIn,
    request: Request,
    principal: AuthenticatedPrincipal | None = Depends(_optional_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 1B: Adversarial CraftProof Audit checking craft economics, stock anomalies & GI conflicts."""
    _enforce_ai_rate_limit(request, principal)
    seller = None
    if principal is not None:
        seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == principal.user_id))
    result = audit_craft_listing(
        db,
        settings=settings,
        payload=payload,
        seller_profile=seller,
        actor_user_id=principal.user_id if principal else None,
    )
    if payload.passport_id:
        invalidate_passport_cache(settings=settings)
    return result


@router.post("/buyer-assistant/ask")
def post_buyer_assistant_ask(
    payload: BuyerAssistantAskIn,
    request: Request,
    principal: AuthenticatedPrincipal | None = Depends(_optional_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 3: Public evidence-locked Buyer Assistant bound strictly to live MySQL Craft Passport rows."""
    _enforce_ai_rate_limit(request, principal)
    return answer_buyer_passport_question(
        db,
        settings=settings,
        payload=payload,
        actor_user_id=principal.user_id if principal else None,
    )


@router.get("/admin/interaction-logs")
def admin_list_ai_interaction_logs(
    workflow_type: str | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=200),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> dict:
    """Admin audit trail of every local/cloud LLM interaction persisted in `ai_interaction_logs`."""
    if not principal.is_active_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required to view AI interaction audit logs.",
        )

    stmt = select(AIInteractionLog)
    if workflow_type:
        stmt = stmt.where(AIInteractionLog.workflow_type == workflow_type.upper())
    rows = list(db.scalars(stmt.order_by(AIInteractionLog.created_at.desc()).limit(limit)).all())
    return {
        "count": len(rows),
        "items": [
            {
                "id": r.id,
                "workflow_type": r.workflow_type,
                "actor_user_id": r.actor_user_id,
                "target_type": r.target_type,
                "target_ref": r.target_ref,
                "provider_used": r.provider_used,
                "model_used": r.model_used,
                "latency_ms": r.latency_ms,
                "input_text": r.input_text,
                "output_summary": r.output_summary,
                "overclaim_guard_triggered": bool(r.overclaim_guard_triggered),
                "is_legal_proof": bool(r.is_legal_proof),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
