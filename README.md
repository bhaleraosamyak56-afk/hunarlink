# HunarLink — Valley Craft Guild

**Authenticity-First Jammu & Kashmir Handicrafts Marketplace & Craft Provenance Platform.**  
Connects verified Kashmiri artisan workshops directly with retail collectors and B2B hospitality buyers — eliminating middlemen while blocking counterfeit machine-made crafts through database-enforced onboarding, 10-layer AI/rule guardrails, and cryptographic Digital Craft Passports.

---

## Architecture Overview (Full-Stack React + FastAPI + MySQL 8 + Redis)

HunarLink is a production-structured monorepo connecting a **React 18 + Vite** SPA to a **FastAPI + SQLAlchemy 2.x + Alembic** backend backed by **MySQL 8.0/8.4** as the primary source of truth and **Redis** for read-through caching, distributed sliding-window rate limiting, stampede protection, and Admin session revocation (with automatic fallback when Redis is offline):

```text
[React 18 SPA (:5173)]  ──(Vite Proxy /api/* + Bearer JWT)──▶  [FastAPI v1 (:8000)]  ──(SQLAlchemy 2.x)──▶  [MySQL 8.0/8.4 DB]
   │                                                               │                                         ▲ (Source of Truth)
   │                                                               ├──▶ [Redis (:6379)] (Read-Through Cache, ZSET Rate Limiter,
   │                                                               │                     Single-Flight Locks & Admin jti Denylist)
   ├── Clerk Identity (Google/Apple OAuth, Password, OTP)          ├── Auth & RBAC (`modules/auth/`) — Clerk RS256 JWKS + PBKDF2 Admin Auth
   ├── Dual-Track Artisan Onboarding (`/auth?tab=verify`)          ├── Storefront & Admin (`modules/storefront/`) — Catalog, Orders, Live Approval
   ├── Seller Studio + Artisan AI Copilot (`/seller`)              ├── ASIGS 10-Layer Guardrails (`modules/guardrails/`) — Anti-Counterfeit & File Scan
   ├── CraftProof Digital Passports (`/passport/:code`)            ├── CraftProof Passports (`modules/craftproof/`) — QR Provenance & Evidence Ledger
   ├── B2B Wholesale & Demand Bridge (`/wholesale`)                ├── AI Services (`modules/ai/`) — Doc Pre-Screen, Listing Audit, Buyer Assistant
   └── HunarSathi Streaming Chatbot (`hunarsathi-chatbot/:5050`)   ├── B2B Demand Bridge (`modules/demand_bridge/`) — Cluster Capacity Matcher
                                                                   └── Razorpay Standard Checkout (`modules/payments/`) — HMAC SHA-256 & Webhooks
```

---

## Repository Structure

```text
hunarlink/
├── app/                          # React 18 + Vite frontend SPA
│   ├── src/
│   │   ├── components/           # ClerkBoundary, modals, CraftProof, Seller Copilot, DemandBridge
│   │   ├── pages/                # HomePage, ProductPage, PassportPage, AuthPage, WholesalePage
│   │   │   └── portal/           # LoginPage, SellerPage, AdminPage
│   │   ├── services/             # apiClient.js, craftproofApi.js (real FastAPI REST clients)
│   │   └── state/                # StoreContext.jsx (hydrates catalog, artisans, orders from FastAPI)
│   ├── .env.example              # Frontend environment template (no secrets committed)
│   └── vite.config.js            # Proxies /api/* -> FastAPI (:8000) and /api/chat* -> HunarSathi (:5050)
├── backend/                      # FastAPI + SQLAlchemy 2.x + Alembic backend (70 REST endpoints)
│   ├── alembic/                  # Migrations 0001 -> 0005 (95+ baseline tables + ASIGS + CraftProof + AI logs)
│   ├── app/
│   │   ├── core/                 # config.py, database.py, redis_client.py, cache.py, auth.py, security.py
│   │   ├── integrations/         # razorpay/ (Decimal<->paise, constant-time HMAC SHA-256)
│   │   ├── models/               # core_models.py, guardrail_models.py, craftproof_models.py
│   │   └── modules/              # auth, storefront, guardrails, craftproof, ai, demand_bridge, payments
│   ├── docs/                     # ASIGS, Razorpay, and Windows Redis setup guides
│   ├── scripts/                  # setup_mysql_and_sync.py, seed_real_artisans.py, seed_dev_preview.py
│   ├── tests/                    # 91 automated pytest integration, Redis & security tests
│   └── .env.example              # Backend environment template (MySQL, Redis, Clerk, Razorpay, Gemini)
├── hunarlink-database/           # MySQL 8.0/8.4 full DDL (`hunarlink_mysql_full_install.sql`) & modular SQL
├── hunarsathi-chatbot/           # Dedicated streaming Gemini Flash buyer assistant (:5050) + instant fallback
├── docs/
│   ├── api/                      # Exported OpenAPI 3.1 spec + Postman v2.1 Collection (72 requests)
│   └── round3_judge_qa_guide.md  # End-to-end request trace, architecture & team Q&A reference
└── security/                     # Nginx, WAF, MySQL privilege hardening & incident response runbooks
```

---

## Quick Start (Local Full-Stack Demo)

### 1. Environment Variables Setup
All secrets live outside source code in gitignored `.env` / `.env.local` files:

```bash
cp backend/.env.example backend/.env
cp app/.env.example app/.env.local
cp hunarsathi-chatbot/.env.example hunarsathi-chatbot/.env   # optional for live Gemini streaming
```
Fill in your local MySQL credentials, Redis settings (`REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379` — see [`backend/docs/redis_setup_windows.md`](backend/docs/redis_setup_windows.md) for Windows setup; FastAPI falls back automatically if Redis is not running), Clerk keys (`VITE_CLERK_PUBLISHABLE_KEY` in `app/.env.local`, `CLERK_ISSUER` & `CLERK_JWKS_URL` in `backend/.env`), and Razorpay Test keys (`rzp_test_*`).

### 2. Provision MySQL Schema & Seed Authentic J&K Catalog
```bash
python -m venv backend/.venv
source backend/.venv/bin/activate          # Windows: backend\.venv\Scripts\activate
pip install -r backend/requirements.txt

# Creates/updates MySQL tables, runs Alembic migrations, and seeds verified Kashmiri artisans & crafts
python backend/scripts/setup_mysql_and_sync.py
python backend/scripts/seed_real_artisans.py
```

### 3. Start Backend API (`:8000`)
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Interactive Swagger / OpenAPI UI:** `http://localhost:8000/docs`
- **Health & DB Readiness Probes:** `http://localhost:8000/healthz` and `http://localhost:8000/readyz`

### 4. Start React Frontend (`:5173`)
```bash
cd app
npm install
npm run dev
```
Open **`http://localhost:5173`**.

*(Optional)* Start the streaming **HunarSathi** microservice in a third terminal (`cd hunarsathi-chatbot && pip install -r requirements.txt && python server.py`).

---

## API Collection & Automated Tests

- **Postman Collection (Ready to Import):** [`docs/api/HunarLink_Round3.postman_collection.json`](docs/api/HunarLink_Round3.postman_collection.json) (72 pre-configured requests grouped across all 9 backend domains with `{{baseUrl}}`, `{{clerkBearerToken}}`, and `{{adminToken}}` variables).
- **OpenAPI 3.1 Specification:** [`docs/api/openapi.json`](docs/api/openapi.json) or live at `http://localhost:8000/docs`.
- **Run Automated Backend Test Suite (`91 passed`):**
  ```bash
  backend/.venv/bin/pytest -v backend/tests
  ```

---

## End-to-End Request Trace (Example: Artisan Card Verification -> Live Storefront)

1. **Step 1 Identity (`/login?role=artisan`)**: Artisan registers/signs in via Clerk (Email+Password, OTP, or Google/Apple). `ClerkBoundary.jsx` sends a signed RS256 JWT to `POST /api/v1/auth/sync`, creating an `ACTIVE` row in `users` + `DIRECT_SELLER` in `user_role_assignments` (while blocking duplicate re-registration with `409 Conflict` and unregistered sign-ins with `404 Not Found`).
2. **Step 2 Credential & Card Upload (`/auth?tab=verify`)**: Unverified artisans are automatically gated to `/auth?tab=verify`. Uploading their J&K Handicrafts / Pehchan Artisan Card calls `POST /api/v1/guardrails/documents/upload` (validates magic bytes, size, SHA-256, and malware scan into `file_security_scans`), then `POST /api/v1/auth/artisan-verification` stages `seller_profiles` (`DRAFT` / `SUBMITTED`) and `seller_verification_applications` (`SUBMITTED`).
3. **Step 3 Admin Inspection & Promotion (`/admin`)**: An authenticated Admin (`POST /api/v1/auth/admin-login`, PBKDF2-SHA256) inspects the private scanned Artisan Card via `GET /api/v1/guardrails/documents/{scan_id}` and clicks **Verify & Push Live** (`POST /api/v1/admin/artisan-applications/{id}/decision`), atomically promoting `seller_profiles` to `APPROVED` + `ACTIVE` and writing an immutable `audit_logs` entry.
4. **Step 4 Guardrailed Listing & Buyer Checkout (`/seller` -> `/` -> `/orders`)**: The verified artisan publishes crafts through `POST /api/v1/seller/studio/listings` (checked by the 10-layer ASIGS guardrail engine), issues a QR CraftProof Passport (`/passport/:code`), and buyers place orders via `POST /api/v1/orders/retail` + Razorpay HMAC verification (`POST /api/v1/payments/razorpay/verify`).

---

## Security & Guardrails Summary

- **Authentication & RBAC:** Clerk RS256 JWKS verification (`backend/app/core/auth.py`) + scoped Admin credentials (`AdminCredential` with PBKDF2-SHA256) + fine-grained role permissions (`DIRECT_SELLER`, `CUSTOMER`, `DEALER`, `SUPPLIER`, `SUPER_ADMIN`, `guardrails.decide`, `payments.refund`).
- **SQLi & XSS Protection:** 100% SQLAlchemy 2.x parameterized ORM queries, strict UUID/slug regex validation, Pydantic v2 input schemas, CSP/X-Frame-Options/nosniff headers, and zero `innerHTML` user-input injection.
- **Abuse & Counterfeit Prevention:** Per-IP sliding-window rate limiting (`429 Too Many Requests`), private quarantined document uploads (`file_security_scans`), and the 10-layer ASIGS Seller Input Guardrail engine.

---

## Team Module Ownership Template

*(Update with your team members' names & GitHub handles before final presentation)*

| Module / Surface | Key Directories & Files | Primary Owner |
|---|---|---|
| Authentication, RBAC & Admin Verification Pipeline | `backend/app/modules/auth/`, `app/src/components/ClerkBoundary.jsx`, `app/src/pages/AuthPage.jsx`, `app/src/pages/portal/LoginPage.jsx` | Team Member 1 |
| Storefront Catalog, Retail Orders & Admin Console | `backend/app/modules/storefront/`, `app/src/pages/portal/AdminPage.jsx`, `app/src/pages/OrdersPage.jsx` | Team Member 2 |
| ASIGS 10-Layer Guardrails & Security Hardening | `backend/app/modules/guardrails/`, `backend/app/core/security.py`, `security/` | Team Member 3 |
| CraftProof Digital Passports, AI Copilot & B2B Demand Bridge | `backend/app/modules/craftproof/`, `backend/app/modules/ai/`, `backend/app/modules/demand_bridge/`, `app/src/pages/PassportPage.jsx` | Team Member 4 |
| Razorpay Payments, Webhooks & MySQL 8 Schema | `backend/app/modules/payments/`, `backend/app/integrations/razorpay/`, `hunarlink-database/` | Team Member 5 |
| HunarSathi Buyer Chatbot & Frontend Craft UX | `hunarsathi-chatbot/`, `app/src/components/sections/`, `app/src/pages/HomePage.jsx` | Team Member 6 |
