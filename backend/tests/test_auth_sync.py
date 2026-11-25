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


def test_05_user_addresses_crud_requires_auth_and_persists_in_db(app_and_client, db_session):
    app, client = app_and_client
    _set_clerk_claims(app, {"sub": "user_2addrTest01"})
    sync = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "addr.user@example.com",
            "first_name": "Aarav",
            "requested_role": "buyer",
        },
    )
    assert sync.status_code == 200

    from app.core.auth import load_principal_by_clerk_id

    set_authenticated_principal(app, None)
    assert client.get("/api/v1/auth/addresses").status_code == 401

    principal = load_principal_by_clerk_id(db_session, "user_2addrTest01")
    set_authenticated_principal(app, principal)
    assert client.get("/api/v1/auth/addresses").json() == []

    created = client.post(
        "/api/v1/auth/addresses",
        json={
            "address_label": "HOME",
            "recipient_name": "Aarav Sharma",
            "recipient_phone": "+91 9811044210",
            "line1": "Residency Road, Near Lal Chowk",
            "city": "Srinagar",
            "state_province": "Jammu and Kashmir",
            "postal_code": "190001",
            "is_default": True,
        },
    )
    assert created.status_code == 201
    addr_id = created.json()["id"]
    assert created.json()["is_default"] is True

    listed = client.get("/api/v1/auth/addresses").json()
    assert len(listed) == 1
    assert listed[0]["id"] == addr_id

    del_resp = client.delete(f"/api/v1/auth/addresses/{addr_id}")
    assert del_resp.status_code == 204
    assert client.get("/api/v1/auth/addresses").json() == []

    _set_clerk_claims(app, None)
    app.dependency_overrides.pop(get_current_principal, None)


def test_06_admin_overview_blocks_guests_and_normal_users_but_allows_db_admin(app_and_client, db_session):
    from app.core.auth import load_principal_by_clerk_id
    from app.models.base import new_uuid
    from app.models.core_models import (
        AdminPermission,
        AdminProfile,
        AdminRole,
        AdminRolePermission,
        AdminUserRole,
    )

    app, client = app_and_client

    # 1. Guest -> 401
    set_authenticated_principal(app, None)
    assert client.get("/api/v1/admin/overview").status_code == 401

    # 2. Normal signed-in buyer -> is_admin=False & 403 on /admin/overview
    _set_clerk_claims(app, {"sub": "user_2normalBuyer99"})
    sync = client.post(
        "/api/v1/auth/sync",
        json={"email": "normal.buyer@example.com", "first_name": "Riya", "requested_role": "buyer"},
    )
    assert sync.status_code == 200
    assert sync.json()["is_admin"] is False

    buyer_principal = load_principal_by_clerk_id(db_session, "user_2normalBuyer99")
    set_authenticated_principal(app, buyer_principal)
    assert client.get("/api/v1/auth/me").json()["is_admin"] is False
    assert client.get("/api/v1/admin/overview").status_code == 403

    # 3. Promote to active DB Admin (ADMIN platform role + AdminProfile + permissions)
    from sqlalchemy import select
    from app.models.core_models import PlatformRole, UserRoleAssignment

    adm_plat = db_session.scalar(select(PlatformRole).where(PlatformRole.code == "ADMIN"))
    if adm_plat is None:
        adm_plat = PlatformRole(id=new_uuid(), code="ADMIN", name="Admin", is_active=True)
        db_session.add(adm_plat)
    ap = AdminProfile(id=new_uuid(), user_id=buyer_principal.user_id, admin_status="ACTIVE")
    ar = AdminRole(id=new_uuid(), code="SUPER_ADMIN_TEST", name="Super Admin", is_active=True)
    perm = db_session.scalar(select(AdminPermission).where(AdminPermission.code == "payments.read"))
    if perm is None:
        perm = AdminPermission(id=new_uuid(), code="payments.read", module_name="payments", is_high_risk=False)
        db_session.add(perm)
    db_session.add_all([ap, ar])
    db_session.flush()
    db_session.add_all([
        UserRoleAssignment(
            id=new_uuid(),
            user_id=buyer_principal.user_id,
            platform_role_id=adm_plat.id,
            assignment_status="ACTIVE",
        ),
        AdminRolePermission(id=new_uuid(), admin_role_id=ar.id, admin_permission_id=perm.id),
        AdminUserRole(id=new_uuid(), admin_profile_id=ap.id, admin_role_id=ar.id, is_active=True),
    ])
    db_session.commit()

    admin_principal = load_principal_by_clerk_id(db_session, "user_2normalBuyer99")
    set_authenticated_principal(app, admin_principal)
    me = client.get("/api/v1/auth/me").json()
    assert me["is_admin"] is True
    assert "payments.read" in me["admin_permissions"]

    overview = client.get("/api/v1/admin/overview")
    assert overview.status_code == 200
    assert overview.json()["counts"]["users"] >= 1

    _set_clerk_claims(app, None)
    app.dependency_overrides.pop(get_current_principal, None)


def test_07_admin_password_login_allows_only_db_provisioned_admins_and_revocation_works(app_and_client, db_session):
    from sqlalchemy import select
    from app.core.admin_security import hash_admin_password
    from app.models.base import new_uuid
    from app.models.core_models import (
        AdminCredential,
        AdminPermission,
        AdminProfile,
        AdminRole,
        AdminRolePermission,
        AdminUserRole,
        PlatformRole,
        User,
        UserRoleAssignment,
    )

    app, client = app_and_client
    # Remove any dependency override so the REAL HS256 JWT + DB check runs end-to-end
    app.dependency_overrides.pop(get_current_principal, None)

    # 1. Unknown / non-admin email is rejected (401)
    r_unknown = client.post(
        "/api/v1/auth/admin-login",
        json={"email": "outsider@example.com", "password": "SomePassword123!"},
    )
    assert r_unknown.status_code == 401

    # 2. Provision one dedicated Admin directly in DB
    admin_user = User(
        id=new_uuid(),
        clerk_user_id="hl_admin_test_001",
        email="chief.admin@hunarlink.test",
        email_verified=True,
        first_name="Chief",
        last_name="Admin",
        display_name="Chief Admin",
        account_status="ACTIVE",
    )
    db_session.add(admin_user)
    db_session.flush()

    plat_role = db_session.scalar(select(PlatformRole).where(PlatformRole.code == "ADMIN"))
    if plat_role is None:
        plat_role = PlatformRole(id=new_uuid(), code="ADMIN", name="Admin", is_active=True)
        db_session.add(plat_role)
    ap = AdminProfile(id=new_uuid(), user_id=admin_user.id, admin_status="ACTIVE")
    ar = AdminRole(id=new_uuid(), code="SUPER_ADMIN_PW_TEST", name="Super Admin", is_active=True)
    perm = db_session.scalar(select(AdminPermission).where(AdminPermission.code == "payments.read"))
    if perm is None:
        perm = AdminPermission(id=new_uuid(), code="payments.read", module_name="payments", is_high_risk=False)
        db_session.add(perm)
    db_session.add_all([ap, ar])
    db_session.flush()

    secret_pw = "ValleyAdmin#2026!"
    cred = AdminCredential(
        id=new_uuid(),
        user_id=admin_user.id,
        email=admin_user.email,
        password_hash=hash_admin_password(secret_pw),
        is_active=True,
    )
    db_session.add_all([
        UserRoleAssignment(
            id=new_uuid(),
            user_id=admin_user.id,
            platform_role_id=plat_role.id,
            assignment_status="ACTIVE",
        ),
        AdminRolePermission(id=new_uuid(), admin_role_id=ar.id, admin_permission_id=perm.id),
        AdminUserRole(id=new_uuid(), admin_profile_id=ap.id, admin_role_id=ar.id, is_active=True),
        cred,
    ])
    db_session.commit()

    # 3. Wrong password -> 401
    r_bad = client.post(
        "/api/v1/auth/admin-login",
        json={"email": admin_user.email, "password": "WrongPassword!"},
    )
    assert r_bad.status_code == 401

    # 4. Correct email + password -> 200 + working HS256 Admin JWT
    r_ok = client.post(
        "/api/v1/auth/admin-login",
        json={"email": admin_user.email, "password": secret_pw},
    )
    assert r_ok.status_code == 200
    body = r_ok.json()
    token = body["access_token"]
    assert body["email"] == admin_user.email
    assert "payments.read" in body["admin_permissions"]

    # 5. Live DB Admin Overview works with real Bearer token & returns hashed credential row
    ov = client.get(
        "/api/v1/admin/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ov.status_code == 200
    creds_list = ov.json()["admin_credentials"]
    assert len(creds_list) == 1
    assert creds_list[0]["email"] == admin_user.email
    assert creds_list[0]["password_hash"].startswith("pbkdf2_sha256$")
    assert secret_pw not in creds_list[0]["password_hash"]

    # 6. Revoking admin credential immediately invalidates existing token (403)
    cred.is_active = False
    db_session.commit()
    ov_revoked = client.get(
        "/api/v1/admin/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ov_revoked.status_code == 403


def test_08_existing_user_cannot_reregister_and_unverified_artisan_flagged_until_admin_approves(app_and_client, db_session):
    from sqlalchemy import select
    from app.models.core_models import SellerProfile
    from tests.conftest import seed_marketplace_entities, set_authenticated_principal

    app, client = app_and_client
    app.dependency_overrides.pop(get_current_principal, None)

    # 1. Brand-new email does not exist yet
    chk0 = client.post("/api/v1/auth/check-account", json={"email": "new.artisan@kashmir.example"})
    assert chk0.status_code == 200
    assert chk0.json()["exists"] is False

    # 2. First-time signup succeeds and marks artisan as NOT YET VERIFIED
    _set_clerk_claims(app, {"sub": "user_artisan_new_001", "email": "new.artisan@kashmir.example"})
    reg = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "new.artisan@kashmir.example",
            "email_verified": True,
            "first_name": "Bilal",
            "last_name": "Dar",
            "requested_role": "artisan",
            "auth_mode": "signup",
        },
    )
    assert reg.status_code == 200
    rbody = reg.json()
    assert rbody["is_new_user"] is True
    assert rbody["is_artisan"] is True
    assert rbody["artisan_verified"] is False
    assert rbody["seller_profile"] is None

    # 3. Account check now reports exists=True & artisan_verified=False
    chk1 = client.post("/api/v1/auth/check-account", json={"email": "new.artisan@kashmir.example"})
    assert chk1.status_code == 200
    assert chk1.json()["exists"] is True
    assert chk1.json()["is_artisan"] is True
    assert chk1.json()["artisan_verified"] is False

    # 4. Trying to REGISTER AGAIN (auth_mode="signup") is BLOCKED with 409 Conflict!
    rereg = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "new.artisan@kashmir.example",
            "email_verified": True,
            "first_name": "Bilal",
            "requested_role": "artisan",
            "auth_mode": "signup",
        },
    )
    assert rereg.status_code == 409
    assert "already exists" in rereg.json()["detail"].lower()

    # 5. Logging in (auth_mode="signin") succeeds, still artisan_verified=False -> must land on Verify page first!
    login = client.post(
        "/api/v1/auth/sync",
        json={
            "email": "new.artisan@kashmir.example",
            "email_verified": True,
            "first_name": "Bilal",
            "requested_role": "artisan",
            "auth_mode": "signin",
        },
    )
    assert login.status_code == 200
    assert login.json()["artisan_verified"] is False

    # 6. Artisan submits verification -> status=SUBMITTED (still not APPROVED until Admin verifies)
    from app.core.auth import AuthenticatedPrincipal

    artisan_user_id = rbody["user_id"]
    set_authenticated_principal(
        app,
        AuthenticatedPrincipal(
            user_id=artisan_user_id,
            clerk_user_id="user_artisan_new_001",
            email="new.artisan@kashmir.example",
            account_status="ACTIVE",
            roles=frozenset({"DIRECT_SELLER", "CUSTOMER"}),
        ),
    )
    sub = client.post(
        "/api/v1/auth/artisan-verification",
        json={
            "store_name": "Dar Heritage Looms",
            "craft_specialty": "Pashmina Textiles",
            "workshop_district": "Srinagar",
            "verification_path": "GI",
            "claimed_gi_code": "GI-JK-PASH-9910",
        },
    )
    assert sub.status_code == 201
    seller_id = sub.json()["seller_profile"]["seller_profile_id"]
    assert sub.json()["seller_profile"]["verification_status"] == "SUBMITTED"

    chk2 = client.post("/api/v1/auth/check-account", json={"email": "new.artisan@kashmir.example"})
    assert chk2.json()["artisan_verified"] is False
    assert chk2.json()["artisan_verification_status"] == "SUBMITTED"

    # 7. Admin approves the artisan -> DB sets APPROVED + ACTIVE -> artisan_verified becomes True!
    entities = seed_marketplace_entities(db_session)
    set_authenticated_principal(app, entities["admin_principal"])
    approve = client.post(
        f"/api/v1/admin/sellers/{seller_id}/verify",
        json={"decision": "APPROVED"},
    )
    assert approve.status_code == 200
    assert approve.json()["verification_status"] == "APPROVED"
    assert approve.json()["profile_status"] == "ACTIVE"

    chk3 = client.post("/api/v1/auth/check-account", json={"email": "new.artisan@kashmir.example"})
    assert chk3.json()["artisan_verified"] is True
    assert chk3.json()["artisan_verification_status"] == "APPROVED"

    _set_clerk_claims(app, None)
    app.dependency_overrides.pop(get_current_principal, None)
