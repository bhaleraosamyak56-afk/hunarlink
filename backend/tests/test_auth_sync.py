"""Tests for Clerk JWT -> HunarLink DB user sync, /auth/me, and Artisan verification."""
from __future__ import annotations

from sqlalchemy import func, select

from app.core.auth import get_current_principal, get_verified_clerk_claims
from app.models.core_models import (
    PlatformRole,
    SellerProfile,
    SellerVerificationApplication,
    User,
    UserRoleAssignment,
)
from tests.conftest import set_authenticated_principal


def _set_clerk_claims(app, claims: dict | None) -> None:
    if claims is None:
        app.dependency_overrides.pop(get_verified_clerk_claims, None)
    else:
        app.dependency_overrides[get_verified_clerk_claims] = lambda: claims


def test_01_auth_sync_requires_verified_bearer_token(app_and_client):
    app, client = app_and_client
    _set_clerk_claims(app, None)

    resp = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "new.buyer@example.com",
            "first_name": "Riya",
            "requested_role": "buyer",
        },
    )
    assert resp.status_code == 401


def test_02_new_buyer_login_creates_user_and_customer_role_in_db(app_and_client, db_session):
    app, client = app_and_client
    _set_clerk_claims(app, {"sub": "user_2newBuyer001", "iss": "https://test.clerk.accounts.dev"})

    resp = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "Riya.Verma@Example.com",
            "email_verified": True,
            "first_name": "Riya",
            "last_name": "Verma",
            "display_name": "Riya Verma",
            "phone": "+91 9811011223",
            "requested_role": "buyer",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["synced"] is True
    assert body["is_new_user"] is True
    assert body["clerk_user_id"] == "user_2newBuyer001"
    assert body["email"] == "riya.verma@example.com"
    assert body["roles"] == ["CUSTOMER"]
    assert body["account_status"] == "ACTIVE"

    # Confirm persisted in DB
    db_user = db_session.scalar(select(User).where(User.clerk_user_id == "user_2newBuyer001"))
    assert db_user is not None
    assert db_user.email == "riya.verma@example.com"
    assert db_user.first_name == "Riya"

    # Re-sync updates cleanly without duplicating user rows
    resp2 = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "riya.verma@example.com",
            "email_verified": True,
            "first_name": "Riya",
            "last_name": "Verma-Kapoor",
            "requested_role": "buyer",
        },
    )
    assert resp2.status_code == 200
    assert resp2.json()["is_new_user"] is False
    assert resp2.json()["last_name"] == "Verma-Kapoor"
    user_count = db_session.scalar(
        select(func.count(User.id)).where(User.clerk_user_id == "user_2newBuyer001")
    )
    assert user_count == 1
    _set_clerk_claims(app, None)


def test_03_auth_sync_blocks_admin_role_and_extra_fields(app_and_client):
    app, client = app_and_client
    _set_clerk_claims(app, {"sub": "user_2attacker01"})

    resp_admin = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "attacker@example.com",
            "first_name": "Bad",
            "requested_role": "admin",
        },
    )
    assert resp_admin.status_code == 422

    resp_extra = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "attacker@example.com",
            "first_name": "Bad",
            "requested_role": "buyer",
            "clerk_user_id": "user_spoofed",
        },
    )
    assert resp_extra.status_code == 422
    _set_clerk_claims(app, None)


def test_04_artisan_sync_and_verification_persists_seller_profile_without_self_approval(
    app_and_client, db_session
):
    app, client = app_and_client
    _set_clerk_claims(app, {"sub": "user_2newArtisan01"})

    sync_resp = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "bilal.loom@example.com",
            "email_verified": True,
            "first_name": "Bilal",
            "last_name": "Dar",
            "display_name": "Bilal Dar",
            "requested_role": "artisan",
        },
    )
    assert sync_resp.status_code == 200
    synced = sync_resp.json()
    assert synced["is_new_user"] is True
    assert set(synced["roles"]) == {"CUSTOMER", "DIRECT_SELLER"}

    # Now load principal cleanly via DB lookup and submit Artisan GI verification
    from app.core.auth import load_principal_by_clerk_id

    principal = load_principal_by_clerk_id(db_session, "user_2newArtisan01")
    set_authenticated_principal(app, principal)

    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["user_id"] == synced["user_id"]

    ver_resp = client.post(
        "/api/v1/auth/artisan-verification",
        json={
            "store_name": "Dar Heritage Pashmina Atelier",
            "craft_specialty": "Pashmina Handloom",
            "workshop_district": "Srinagar",
            "verification_path": "GI",
            "claimed_gi_code": "GI-JK-PASH-9911",
            "skill_description": "Third-generation hand-spun Changthangi pashmina weavers.",
            "phone": "+91 9906123456",
        },
    )
    assert ver_resp.status_code == 201
    ver = ver_resp.json()
    assert ver["application_status"] == "SUBMITTED"
    # ASIGS guardrail: sellers can NEVER self-approve GI verification
    assert ver["seller_profile"]["verification_status"] == "SUBMITTED"
    assert ver["seller_profile"]["store_name"] == "Dar Heritage Pashmina Atelier"

    db_seller = db_session.scalar(
        select(SellerProfile).where(SellerProfile.user_id == synced["user_id"])
    )
    assert db_seller is not None
    assert db_seller.verification_status == "SUBMITTED"
    db_app = db_session.scalar(
        select(SellerVerificationApplication).where(
            SellerVerificationApplication.seller_profile_id == db_seller.id
        )
    )
    assert db_app is not None
    assert db_app.claimed_gi_code == "GI-JK-PASH-9911"

    _set_clerk_claims(app, None)
    app.dependency_overrides.pop(get_current_principal, None)
