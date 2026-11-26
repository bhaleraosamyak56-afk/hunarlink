"""FastAPI Router for CraftProof AI Services (Local Ollama + Provider-Agnostic Gateway)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
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
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.models.core_models import SellerProfile
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
            return load_admin_principal_by_user_id(db, str(admin_claims["sub"]))
        verifier = get_token_verifier(settings)
        claims = verifier.verify(token)
        return load_principal_by_clerk_id(db, str(claims["sub"]))
    except Exception:
        return None


@router.get("/status")
def get_ai_gateway_status(settings: Settings = Depends(get_settings)) -> dict:
    """Inspect local Ollama reachability, active model (`qwen2.5:3b`), and fallback readiness."""
    gateway = LocalAIGateway(settings)
    return gateway.probe_status()


@router.post("/artisan-doc/prescreen")
def post_artisan_doc_prescreen(
    payload: ArtisanDocPreScreenIn,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 1A: Pre-screen uploaded GI Certificate / Artisan Card & pass advisory dossier to Admin."""
    return prescreen_artisan_document(
        db,
        settings=settings,
        payload=payload,
        actor_user_id=principal.user_id,
    )


@router.post("/artisan-copilot/draft")
def post_artisan_copilot_draft(
    payload: ArtisanCopilotDraftIn,
    principal: AuthenticatedPrincipal | None = Depends(_optional_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 2: Turn Hindi / Hinglish / English artisan voice/text notes into an editable listing + Fair-Craft breakdown."""
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
    return draft_artisan_listing(settings=settings, payload=enriched)


@router.post("/craft-audit/listing")
def post_craft_audit_listing(
    payload: CraftAuditListingIn,
    principal: AuthenticatedPrincipal | None = Depends(_optional_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 1B: Adversarial CraftProof Audit checking craft economics, stock anomalies & GI conflicts."""
    seller = None
    if principal is not None:
        seller = db.scalar(select(SellerProfile).where(SellerProfile.user_id == principal.user_id))
    return audit_craft_listing(
        db,
        settings=settings,
        payload=payload,
        seller_profile=seller,
    )


@router.post("/buyer-assistant/ask")
def post_buyer_assistant_ask(
    payload: BuyerAssistantAskIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pillar 3: Public evidence-locked Buyer Assistant bound strictly to live MySQL Craft Passport rows."""
    return answer_buyer_passport_question(db, settings=settings, payload=payload)
