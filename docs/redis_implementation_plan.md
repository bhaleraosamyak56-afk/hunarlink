# HunarLink — Redis Architecture Analysis & Implementation Plan

> **Status:** Implemented & Verified (`91/91` automated backend tests passing)  
> **Repository:** `hunarlink` (React 19 + Vite Frontend · FastAPI + SQLAlchemy 2.x Backend · MySQL 8.0/8.4 LTS · Redis)

---

## 1. Existing Architecture Overview

### 1.1 Frontend Architecture (`app/`)
- **Stack:** React 19 (`^19.3.1`), Vite 8 (`^8.3.8`), `react-router-dom` v7 (`^7.18.6`), and `@clerk/react` (`^6.19.6`).
- **Structure & Routing (`app/src/App.jsx`):**
  - **Public Storefront Routes:**
    - `/` (`HomePage.jsx`) — Hero, featured artisans, live marketplace grid, GI verification section, wholesale banner.
    - `/category/:slug` (`CategoryPage.jsx`) — Guild and craft-technique filtered catalog pages.
    - `/product?id=<uuid>` (`ProductPage.jsx`) — Product detail page (PDP), CraftProof summary & QR link, `BuyerAssistantDrawer`.
    - `/artisans` (`ArtisansPage.jsx`) — Searchable, guild-filterable verified artisan directory.
    - `/artisan?id=<uuid>` & `/artisans/:slug` (`ArtisanProfilePage.jsx`) — Verified workshop profile, bio, reviews, and craft listings.
    - `/passport/:code` (`PassportPage.jsx`) — Public Digital Craft Passport separating human/third-party verified claims from seller declarations.
  - **Authentication & Onboarding Routes:**
    - `/login` (`LoginPage.jsx`), `/auth` (`AuthPage.jsx` with `?tab=verify` for Artisan Card / GI onboarding), `/sso-callback` (`SsoCallbackPage.jsx`).
  - **Protected & Portal Routes:**
    - `/profile` (`ProfilePage.jsx`), `/orders` (`OrdersPage.jsx`), `/seller` (`SellerPage.jsx` — Artisan Studio, AI Copilot, CraftPassports, Cluster Offers), `/wholesale` (`WholesalePage.jsx` + `DemandBridgePanel.jsx`), `/admin` (`AdminPage.jsx` + `AdminLoginPage.jsx` + `AdminCraftProofTab.jsx`).
- **Frontend -> Backend Data Flow (`StoreContext.jsx`, `apiClient.js`, `craftproofApi.js`, `razorpayCheckout.js`):**
  - Vite proxies `/api/*`, `/healthz`, and `/readyz` to FastAPI (`:8000`) and `/api/chat*` to the optional HunarSathi streaming chatbot (`:5050`).
  - On initial mount, `StoreContext.jsx` calls `loadPublicCatalog()`, firing `GET /api/v1/catalog/products?limit=200` and `GET /api/v1/artisans` in parallel. Client-side search, guild, technique, district, rating, GI tier, and price filters (`filteredProducts`) operate over this hydrated catalog, while `ProductPage.jsx` and `ArtisanProfilePage.jsx` re-verify individual records directly against `GET /api/v1/catalog/product?id=...` and `GET /api/v1/artisans/detail?id=...`.
  - On Clerk sign-in/sign-up, `ClerkBoundary.jsx` sends a signed RS256 JWT to `POST /api/v1/auth/sync` and then calls `hydrateFromBackend(token)` (`catalog/products`, `artisans`, `orders/retail/my`, `auth/addresses`).

### 1.2 Backend Architecture (`backend/`)
- **Stack:** Python 3.11+, FastAPI (`0.165.0`), synchronous SQLAlchemy 2.x (`2.0.58`) + `PyMySQL` (`1.2.4`), Alembic (`1.20.1`), Pydantic v2 (`2.14.4`), `PyJWT[crypto]`, `razorpay` SDK, `segno` (QR SVG), `pypdf`.
- **Execution Model:** Synchronous SQLAlchemy engine (`create_engine(..., pool_pre_ping=True)` in `backend/app/core/database.py`) with standard `def` FastAPI route handlers executed in FastAPI's worker threadpool (plus two `async def` handlers strictly for reading multipart file bytes and Razorpay raw webhook payloads).
- **Domain Modules (`backend/app/modules/`):**
  1. `auth/` — Clerk user sync (`/auth/sync`), pre-auth email check (`/auth/check-account`), caller profile (`/auth/me`), artisan card verification staging (`/auth/artisan-verification`), saved addresses (`/auth/addresses`), dedicated Admin password login (`/auth/admin-login`).
  2. `storefront/` — Public product catalog (`/catalog/products`, `/catalog/product`, `/catalog/products/{identifier}`), verified artisans (`/artisans`, `/artisans/detail`, `/artisans/{identifier}`), retail order creation & history (`/orders/retail`, `/orders/retail/my`), Seller Studio (`/seller/studio/listings`, `/seller/studio/validate`), Admin Console overview & moderation (`/admin/overview`, `/admin/listings/{id}/moderate`, `/admin/artisan-applications/{id}/decision`, `/admin/sellers/{id}/verify`).
  3. `guardrails/` — 10-layer ASIGS validation engine for seller listings, supplier lots, dealer profiles/wholesale listings, private file quarantine & magic-byte/malware scanning (`/guardrails/documents/upload`, `/guardrails/documents/{scan_id}`), GI assessment (`/guardrails/verification/assess`), and Admin Guardrail Center (`/admin/guardrail/cases*`, `/admin/guardrail/rules`).
  4. `craftproof/` — Digital Craft Passports, atomic claims (`SELLER_DECLARED` vs `HUMAN_VERIFIED` / `THIRD_PARTY_VERIFIED`), evidence ledger, SVG QR code generation (`/passports/lookup`, `/passports/by-product/{ref}`, `/passports/{code}`, `/passports/{code}/qr.svg`, `/seller/passports/*`, `/admin/passports/claims*`).
  5. `ai/` — Provider-agnostic `LocalAIGateway` (Ollama `qwen2.5:3b` / Groq / Gemini / deterministic fallback) powering Doc Pre-Screen (`/ai/artisan-doc/prescreen`), Artisan Copilot (`/ai/artisan-copilot/draft`), Adversarial Craft Audit (`/ai/craft-audit/listing`), Evidence-Locked Buyer Assistant (`/ai/buyer-assistant/ask`), and `/ai/status`.
  6. `demand_bridge/` — Wholesale brief parser (`/demand-bridge/parse`), deterministic multi-artisan cluster matcher (`/demand-bridge/match`), inquiry dispatch (`/demand-bridge/requests/{id}/dispatch-inquiries`), and seller cluster offer responses (`/seller/demand-bridge/offers*`).
  7. `payments/` — Razorpay Standard Checkout (`create-order`, `verify`), idempotent raw-body HMAC webhook receiver (`/webhooks/razorpay`), payment status, and Admin full/partial refunds.

### 1.3 Database Schema & Models (`hunarlink-database/` & `backend/app/models/`)
- **Primary Database:** MySQL 8.0/8.4 LTS (`utf8mb4`, UUIDs stored as `CHAR(36) ascii_bin`; SQLite in-memory used only in `pytest`).
- **Schema Footprint (5 Alembic migrations `0001`–`0005`):**
  - **95 baseline tables** (`core_models.py` maps the active ORM subset: `users`, `platform_roles`, `user_role_assignments`, `user_addresses`, `admin_profiles`, `admin_roles`, `admin_permissions`, `admin_user_roles`, `admin_role_permissions`, `admin_credentials`, `seller_profiles`, `seller_documents`, `seller_verification_applications`, `gi_reference_records`, `categories`, `products`, `product_images`, `product_variants`, `product_gi_claims`, `gi_verification_runs`, `seller_product_listings`, `supplier_profiles`, `supplier_lots`, `dealer_profiles`, `warehouses`, `warehouse_stock`, `retail_orders`, `seller_fulfilment_groups`, `retail_order_items`, `wholesale_orders`, `payments`, `payment_attempts`, `payment_status_history`, `payment_webhook_events`, `refunds`, `audit_logs`, etc.).
  - **6 ASIGS tables** (`guardrail_models.py`): `guardrail_rules`, `guardrail_checks`, `guardrail_cases`, `guardrail_case_events`, `file_security_scans`, `input_fingerprints`.
  - **7 CraftProof & Demand Bridge tables + 1 AI Audit table** (`craftproof_models.py`): `craft_passports`, `craft_product_claims`, `craft_claim_evidence`, `craft_verification_events`, `artisan_capabilities`, `buyer_demand_requests`, `demand_artisan_matches`, `ai_interaction_logs`.

### 1.4 Authentication, Authorization & Roles (`backend/app/core/auth.py`, `admin_security.py`)
1. **Buyers & Artisans:** Authenticated via **Clerk RS256 JWTs** verified against Clerk's JWKS endpoint (`PyJWKClient`, cached per process in `_JWKS_CLIENT_CACHE`). Identity (`sub` -> `users.clerk_user_id`) comes from Clerk; RBAC comes from MySQL (`CUSTOMER`, `DIRECT_SELLER`, `SUPPLIER`, `DEALER`, `ADMIN`).
2. **Administrators:** Dedicated DB-backed Email + PBKDF2-HMAC-SHA256 login (`POST /api/v1/auth/admin-login`) issuing an HS256 JWT (`iss="hunarlink-admin"`), re-verified on every request against `admin_credentials`, `admin_profiles`, and granular permissions (`guardrails.read`, `guardrails.decide`, `sellers.review`, `gi.review`, `procurement.read`, `payments.read`, `payments.refund`).

### 1.5 Database-Heavy Operations & Bottlenecks Identified in Code
1. **In-Memory Rate Limiter (`backend/app/core/security.py:69`):**
   - `SlidingWindowRateLimiter` explicitly states: *`"Thread-safe in-memory sliding-window rate limiter (use Redis in multi-worker prod)."`*
   - State is lost on restart, is not shared across multiple Gunicorn/Uvicorn workers, and is missing on expensive/sensitive endpoints (`/ai/*`, `/demand-bridge/*`, `/guardrails/documents/upload`, `/auth/sync`).
2. **N+1 & Multi-JOIN Hot Read Queries on Every Storefront Load:**
   - `GET /api/v1/artisans` (`storefront/router.py:422-463`): Queries all `SellerProfile JOIN User`, calls `_has_active_direct_seller_role()` **inside a Python comprehension** (~53 SQL queries), and then runs a `SellerProductListing JOIN Product JOIN Category` query **inside another `for` loop** (~53 more SQL queries), plus 2 batch queries = **~108 SQL queries per page load**.
   - `GET /api/v1/catalog/products` (`storefront/router.py:326-380`): Runs a 5-table JOIN (`seller_product_listings`, `products`, `categories`, `seller_profiles`, `users`), plus per-row `_has_active_direct_seller_role()` queries, plus 3 batch queries (`product_images`, `seller_documents`, `seller_verification_applications`).
   - `GET /api/v1/passports/{code}` & `/by-product/{ref}` (`craftproof/service.py:625-770`): `serialize_passport_public()` executes **8 separate SQL queries** (`Product`, `SellerProductListing`, `SellerProfile`, `Category`, `ProductImage`, `CraftProductClaim`, `CraftClaimEvidence`, `CraftVerificationEvent`) every time a buyer opens a PDP or scans a QR tag, and `/qr.svg` regenerates the SVG via `segno` on every request.
   - `GET /readyz` (`main.py:194-255`): Executes `SELECT 1` plus **two 4-table `COUNT(*)` JOINs** every time the frontend health probe runs.
   - `get_current_principal()` (`core/auth.py:124-215`): Executes **3 to 5 SQL queries** (`users`, `user_role_assignments JOIN platform_roles`, `admin_profiles`, `admin_permissions` 4-table JOIN) on **every single authenticated API call**, and Admin HS256 JWTs currently lack server-side `jti` token revocation on logout.

---

## 2. Features That Will Benefit from Redis (Detailed Proposal)

### 2.1 Public Storefront Catalog & Product Detail Cache
- **Why it is needed:** `GET /api/v1/catalog/products` and `GET /api/v1/catalog/products/{identifier}` (and `/catalog/product?id=...`) are hit by every anonymous and signed-in visitor on page load and PDP navigation, running 5-table JOINs + image/portrait/metadata lookups + role checks.
- **What data will be stored:** JSON-serialized `CatalogProductItem` list (keyed by `category_slug` and `limit`) and individual `CatalogProductItem` payloads (by canonical UUID/slug), with exact `Decimal` precision preserved via Pydantic JSON serialization. *(Prohibited-content safety checks on `q` still execute before cache lookup.)*
- **TTL:** `300 seconds` (5 minutes) for catalog lists; `600 seconds` (10 minutes) for individual product detail, with ±10% random jitter.
- **When updated / invalidated:** Immediately invalidated whenever:
  - A seller publishes a listing (`POST /api/v1/seller/studio/listings`, `POST /api/v1/seller/listings`)
  - An admin moderates a listing (`POST /api/v1/admin/listings/{id}/moderate`) or decides a listing guardrail case (`POST /api/v1/admin/guardrail/cases/{id}/decision`)
  - An admin approves/rejects an artisan application or seller status (`POST /api/v1/admin/artisan-applications/{id}/decision`, `POST /api/v1/admin/sellers/{id}/verify`)
- **If Redis becomes unavailable:** Logs a rate-limited warning via circuit breaker and queries MySQL directly with zero API failure.

### 2.2 Verified Artisans Directory & Artisan Profile Cache (+ N+1 Query Batching)
- **Why it is needed:** `GET /api/v1/artisans` currently executes ~108 SQL queries per request (due to per-seller role & listing loops), and `GET /api/v1/artisans/{identifier}` runs 5+ queries on every profile view. Alongside Redis caching, we will also batch `_has_active_direct_seller_role` and seller listing lookups in SQL so cache misses are fast too. *(Unverified/blocked artisan probes on `/artisans/{identifier}` will NEVER be cached as valid profiles and will continue writing `ARTISAN_ENDPOINT_BLOCKED_UNVERIFIED_ID` to `audit_logs` in MySQL.)*
- **What data will be stored:** JSON-serialized `list[ArtisanSummaryItem]` for the directory and `ArtisanDetailResponse` for verified artisan profiles.
- **TTL:** `300 seconds` (5 minutes) for the directory; `600 seconds` (10 minutes) for verified artisan detail.
- **When updated / invalidated:** Invalidated on artisan verification submission (`POST /api/v1/auth/artisan-verification`), admin application decision, admin seller verify/reject, and listing creation/moderation.
- **If Redis becomes unavailable:** Falls back cleanly to MySQL.

### 2.3 CraftProof Digital Passports & SVG QR Code Cache
- **Why it is needed:** `ProductPage.jsx` automatically calls `/api/v1/passports/by-product/{ref}` on every PDP visit, `GiVerifyModal.jsx` calls `/api/v1/passports/lookup?q=...`, and QR scans hit `/api/v1/passports/{code}` + `/api/v1/passports/{code}/qr.svg`. Each passport serialization runs 8 SQL queries across 8 tables, and QR SVG rendering is 100% deterministic for a given `passport_code` + `FRONTEND_BASE_URL`.
- **What data will be stored:**
  - Serialized public passport dict (`serialize_passport_public` output) keyed by `passport_code`, plus a lightweight `product_ref -> passport_code` pointer.
  - Normalized `/passports/lookup` search results.
  - Generated SVG XML string for `/passports/{code}/qr.svg`.
- **TTL:** `600 seconds` (10 minutes) for public passport JSON; `180 seconds` (3 minutes) for lookup queries; `86,400 seconds` (24 hours) for deterministic QR SVGs.
- **When updated / invalidated:** Immediately invalidated whenever:
  - Seller creates/updates a passport (`POST /api/v1/seller/passports/for-listing/{listing_id}`), adds a claim (`POST /api/v1/seller/passports/{id}/claims`), or attaches evidence (`POST /api/v1/seller/passports/claims/{id}/evidence`)
  - Adversarial AI audit records a passport timeline event (`POST /api/v1/ai/craft-audit/listing` when `passport_id` is supplied)
  - Human Admin approves/rejects a CraftProof claim (`POST /api/v1/admin/passports/claims/{id}/decision`) — ensuring trust badges (`SELLER_DECLARED` -> `HUMAN_VERIFIED` / `REJECTED`) update instantaneously.
- **If Redis becomes unavailable:** Falls back to MySQL + live `segno` SVG generation.

### 2.4 Short-TTL RBAC Principal Cache & Admin Session Revocation (`jti` Denylist + Logout)
- **Why it is needed:**
  1. Every authenticated API call invokes `get_current_principal()`, running 3–5 MySQL queries (`users`, `user_role_assignments`, `platform_roles`, `admin_profiles`, `admin_permissions`). A short-TTL cache eliminates 70–80% of repetitive auth DB queries during SPA bursts (e.g., `hydrateFromBackend` firing 4 parallel requests or `AdminPage` firing 6 parallel admin requests).
  2. Dedicated Admin HS256 JWTs (`admin_security.py`) are valid for 8 hours (`28800s`) and currently lack server-side logout revocation. Adding a `jti` claim and a Redis revocation key (`hl:auth:revoked_jti:{jti}`)—plus `POST /api/v1/auth/admin-logout`—allows immediate server-side admin session invalidation without replacing JWTs.
- **What data will be stored:**
  - Non-sensitive `AuthenticatedPrincipal` attributes (`user_id`, `clerk_user_id`, `email`, `account_status`, `roles`, `admin_permissions`, `is_active_admin`) — **never passwords, hashes, or raw tokens**.
  - Revoked Admin JWT `jti` markers (`"1"`).
- **TTL:**
  - Principal RBAC cache: Short **`45 seconds`** TTL so MySQL remains authoritative and any out-of-band DB edit converges within seconds.
  - Revoked Admin `jti`: Exact remaining lifetime (`exp - now`) of the Admin JWT (up to `28,800s`).
- **When updated / invalidated:** Explicitly invalidated on `/auth/sync`, `/auth/artisan-verification`, `/admin/artisan-applications/{id}/decision`, `/admin/sellers/{id}/verify`, and `/auth/admin-logout`.
- **If Redis becomes unavailable:** `get_current_principal()` queries MySQL directly (existing behavior), and `AdminCredential.is_active` in MySQL continues to enforce admin revocation.

### 2.5 Readiness Probe Counts, AI Gateway Status & Admin Overview Short-Burst Cache
- **Why it is needed:**
  - `/readyz` runs two 4-table `COUNT(*)` JOINs on public artisans and listings; caching only the counts while still executing a live `SELECT 1` DB check + Redis `PING` keeps `/readyz` truthful about live database health while removing repeated count scans.
  - `GET /api/v1/ai/status` makes a synchronous `httpx.get("http://127.0.0.1:11434/api/tags", timeout=2.0)` call every time Seller Studio or Admin opens; caching for `30s` avoids repeated socket overhead when Ollama is offline or polled concurrently.
  - `GET /api/v1/admin/overview` runs 8 table queries (up to 1,200 rows across `users`, `seller_profiles`, `applications`, `documents`, `listings`, `orders`, `admin_credentials`, `roles`). A `15s` cache invalidated on mutations accelerates admin tab switching without serving stale moderation queues.
- **What data will be stored:** Public entity counts dict (`readyz`), AI probe status dict (`ai/status`), and serialized admin overview snapshot (`admin/overview`).
- **TTL:** `30 seconds` for `/readyz` counts, `30 seconds` for `/ai/status`, `15 seconds` for `/admin/overview`.
- **When updated / invalidated:** `/readyz` counts and `/admin/overview` invalidated on user sync, artisan application submission/decision, listing publish/moderation, and retail order creation.
- **If Redis becomes unavailable:** Computed directly from MySQL / HTTP probe as today.

### 2.6 Distributed Redis Sliding-Window Rate Limiting
- **Why it is needed:** Upgrades per-process `SlidingWindowRateLimiter` to a shared multi-worker Redis limiter while retaining the existing in-memory limiter as an automatic fallback when Redis is offline. Also extends protection to sensitive & expensive endpoints that currently lack rate limits:
  - `POST /api/v1/auth/admin-login` — `5 req / 60s` per IP + email
  - `POST /api/v1/auth/check-account` — `30 req / 60s` per IP
  - `POST /api/v1/auth/sync` — `20 req / 60s` per IP
  - `GET /api/v1/artisans/{id}` & `/artisans/detail` — `120 req / 60s` per IP
  - `GET /api/v1/catalog/products/{id}` & `/catalog/product` — `180 req / 60s` per IP
  - `POST /api/v1/payments/razorpay/create-order` & `verify` — `60 req / 60s` per user + IP
  - `POST /api/v1/guardrails/documents/upload` — `15 req / 60s` per user
  - `POST /api/v1/ai/*` & `POST /api/v1/demand-bridge/parse` / `match` — `20 req / 60s` per user/IP (protects local Ollama GPU & cloud LLM quotas)
- **What data will be stored:** Redis Sorted Set (`ZSET`) of request timestamps (`score=timestamp_ms`, `member=timestamp_ms:nonce`) evaluated atomically (`ZREMRANGEBYSCORE`, `ZCARD`, `ZADD`, `EXPIRE`).
- **TTL:** Equal to `window_seconds` (`60 seconds`).
- **If Redis becomes unavailable:** Automatically falls back to the thread-safe in-memory `SlidingWindowRateLimiter`.

### 2.7 Cache Stampede Protection (Single-Flight Redis Lock)
- **Why it is needed:** Prevents 50 concurrent homepage visitors from triggering 50 identical multi-JOIN SQL queries simultaneously when a popular key expires.
- **Mechanism:** `cache_get_or_set()` acquires a short Redis lock (`SET hl:lock:{key} <token> NX PX 3000`) on cache miss; concurrent callers wait briefly for cache population or fall through safely to MySQL if the lock holder does not finish within ~250ms.

---

## 3. Features Where Redis Is Unnecessary (Intentionally Excluded)

1. **OTP Generation & Password Reset Codes:** Buyer/Artisan OTPs, email verification codes, OAuth redirects, and password resets are handled end-to-end by **Clerk** (`ClerkBoundary.jsx`), and Admin accounts are strictly DB-provisioned (`create_admin_account.py`) with zero self-service password reset. Building a custom Redis OTP store would be dead/duplicate code.
2. **Replacing Clerk RS256 JWTs or Full Session Duplication:** Clerk JWTs are stateless and cryptographically verified via RS256 JWKS. We will not duplicate Clerk session storage in Redis.
3. **Redis Pub/Sub or WebSockets:** HunarLink has no WebSocket chat or live socket server; `hunarsathi-chatbot` uses stateless HTTP Server-Sent Events (SSE) for single-buyer LLM token streaming, and buyer-to-artisan inquiries are standard REST/state records.
4. **Celery / RQ Background Task Queues:** File magic-byte/malware validation (`<= 5 MB`), QR SVG generation (`< 2 ms`), deterministic cluster matching (`< 15 ms`), and Razorpay order creation (which commits a short `INITIATED` MySQL transaction *before* network I/O) are synchronous request-response flows awaited directly by the UI. Adding Celery/RQ workers would complicate Windows local development without practical benefit.
5. **Financial / Permanent Business Records as Primary Storage:** `users`, `retail_orders`, `wholesale_orders`, `payments`, `payment_attempts`, `payment_webhook_events`, `refunds`, `audit_logs`, `guardrail_checks`, and `ai_interaction_logs` remain **100% MySQL-authoritative**.

---

## 4. Exact APIs and Backend Modules to Create / Modify

### 4.1 New Modules (`backend/app/core/`)
| File | Responsibility |
|---|---|
| `backend/app/core/redis_client.py` | Centralized Redis configuration, `ConnectionPool`, `ping` health check, 15s circuit-breaker cooldown when Redis is unreachable, and clean lifespan shutdown. |
| `backend/app/core/cache.py` | Clean caching & invalidation layer separated from business logic: safe JSON/Pydantic/`Decimal` serialization, `cache_get`, `cache_set`, `cache_get_or_set` (with jitter + stampede lock), `O(1)` namespace version invalidation (`invalidate_catalog_cache`, `invalidate_artisan_cache`, `invalidate_passport_cache`, `invalidate_principal_cache`, `invalidate_admin_overview_cache`), and Admin JWT `jti` revocation helpers. |

### 4.2 Existing Modules to Modify
| File | Planned Modification |
|---|---|
| `backend/requirements.txt` | Add `redis==5.2.1`. |
| `backend/.env.example` | Document `REDIS_*` configuration variables (no hardcoded credentials). |
| `backend/app/core/config.py` | Add typed `REDIS_ENABLED`, `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD` (`SecretStr`), `REDIS_SSL`, `REDIS_KEY_PREFIX`, `REDIS_SOCKET_TIMEOUT_SECONDS`, and TTL settings. |
| `backend/app/core/security.py` | Upgrade `SlidingWindowRateLimiter` to Redis `ZSET` sliding window with automatic fallback to in-memory `deque`. |
| `backend/app/core/admin_security.py` & `auth.py` | Add `jti` UUID claim to Admin HS256 tokens, check `is_admin_token_revoked(jti)`, and add 45s RBAC principal cache in `get_current_principal`. |
| `backend/app/main.py` | Wire Redis lifespan shutdown and add non-sensitive Redis health status + 30s public count cache to `GET /readyz` (while keeping `SELECT 1` live). |
| `backend/app/modules/auth/router.py` | Rate-limit `POST /auth/sync`, add `POST /auth/admin-logout` (`jti` revocation), and invalidate principal/artisan/admin caches on `/auth/sync` and `/auth/artisan-verification`. |
| `backend/app/modules/storefront/router.py` | Batch N+1 SQL loops in `list_verified_artisans` & `list_active_catalog_products`; add read-through Redis caching on `/catalog/*`, `/artisans*`, and `/admin/overview`; invalidate caches after `db.commit()` on order/listing/admin mutations. |
| `backend/app/modules/guardrails/router.py` & `service.py` | Rate-limit `/guardrails/documents/upload`; invalidate catalog/artisan/admin caches when `/seller/listings` creates a listing or `/admin/guardrail/cases/{id}/decision` moderates a listing. |
| `backend/app/modules/craftproof/router.py` | Cache `/passports/{code}`, `/passports/by-product/{ref}`, `/passports/lookup`, and `/passports/{code}/qr.svg`; invalidate passport caches immediately on seller claim/evidence mutations and Admin claim decisions. |
| `backend/app/modules/ai/router.py` & `service.py` | Rate-limit `/ai/*`, cache `/ai/status` (30s), and invalidate passport cache when `/ai/craft-audit/listing` appends an `AI_ADVISORY_RUN` event to a passport. |
| `backend/app/modules/demand_bridge/router.py` | Rate-limit `/demand-bridge/parse` and `/demand-bridge/match`. |
| `app/src/pages/portal/AdminPage.jsx` & `apiClient.js` | *(Optional, non-breaking)* Call `POST /api/v1/auth/admin-logout` best-effort when Admin clicks Sign Out so the Admin JWT `jti` is immediately revoked server-side. |

---

## 5. Proposed Redis Data Structures & Key Naming Conventions

All keys are scoped under `{REDIS_KEY_PREFIX}:` (default `hl:`):

| Purpose | Key Pattern | Redis Type | Stored Value |
|---|---|---|---|
| Namespace Version Counter | `hl:ver:{domain}` (`catalog`, `artisans`, `passports`, `admin`) | `STRING` (int) | Monotonic integer version (`INCR`) |
| Catalog Product List | `hl:cache:catalog:v{ver}:list:{cat_or_all}:lim{limit}` | `STRING` (JSON) | Serialized `list[CatalogProductItem]` |
| Single Product Detail | `hl:cache:catalog:v{ver}:item:{identifier}` | `STRING` (JSON) | Serialized `CatalogProductItem` |
| Verified Artisans Directory | `hl:cache:artisans:v{ver}:list` | `STRING` (JSON) | Serialized `list[ArtisanSummaryItem]` |
| Verified Artisan Detail | `hl:cache:artisans:v{ver}:detail:{identifier}` | `STRING` (JSON) | Serialized `ArtisanDetailResponse` |
| Public Craft Passport | `hl:cache:passports:v{ver}:code:{passport_code}` | `STRING` (JSON) | Serialized public passport dict |
| Product -> Passport Alias | `hl:cache:passports:v{ver}:prod_ref:{product_ref}` | `STRING` | Canonical `passport_code` |
| Passport Search Lookup | `hl:cache:passports:v{ver}:lookup:{sha256_q}:{limit}` | `STRING` (JSON) | Serialized lookup response |
| Passport QR SVG | `hl:cache:qr:v1:{passport_code}:{base_hash}` | `STRING` | Raw SVG XML string |
| Principal RBAC Cache | `hl:auth:principal:clerk:{clerk_user_id}` / `hl:auth:principal:admin:{user_id}` | `STRING` (JSON) | Non-sensitive `AuthenticatedPrincipal` dict |
| Admin JWT Revocation (`jti`) | `hl:auth:revoked_jti:{jti}` | `STRING` | `"1"` |
| Readiness Public Counts | `hl:cache:readyz:v{ver}:counts` | `STRING` (JSON) | `{"public_artisans": int, "public_listings": int}` |
| AI Gateway Probe Status | `hl:cache:ai:status` | `STRING` (JSON) | Ollama/cloud probe dict |
| Admin Console Overview | `hl:cache:admin:v{ver}:overview` | `STRING` (JSON) | Serialized overview dict |
| Sliding-Window Rate Limiter | `hl:rl:{scope}:{identifier}` | `ZSET` | Request timestamps (`score=ms`, `member=ms:nonce`) |
| Stampede Single-Flight Lock | `hl:lock:{cache_key_hash}` | `STRING` (`NX PX`) | Owner UUID token |

> **Why Versioned Keys (`hl:ver:{domain}`) Instead of `KEYS *`?**  
> In production Redis, `KEYS *` blocks the single-threaded server. Incrementing `hl:ver:catalog` via a single `O(1)` `INCR` atomically invalidates every cached list and item key in that domain immediately, while superseded keys expire cleanly via TTL.

---

## 6. Cache Expiration (TTL) Strategy

| Cached Resource | Base TTL | Jitter | Rationale |
|---|---|---|---|
| Catalog Product Lists | `300s` (5 min) | ±10% (`270–330s`) | High read-to-write ratio; invalidated immediately on writes |
| Individual Product / Artisan Detail | `600s` (10 min) | ±10% (`540–660s`) | Frequently revisited during comparison & checkout |
| Verified Artisans Directory | `300s` (5 min) | ±10% (`270–330s`) | Eliminates 100+ query burst on storefront load |
| Public Craft Passport JSON | `600s` (10 min) | ±10% (`540–660s`) | Heavy 8-query join; invalidated immediately on claim/admin updates |
| Passport Lookup Search | `180s` (3 min) | ±10% | Absorbs repeated GI tag verification modal queries |
| Passport QR Code SVG | `86,400s` (24 hr) | None | Deterministic output for `passport_code` + `FRONTEND_BASE_URL` |
| Principal RBAC Lookup | `45s` | None | Cuts auth DB queries by ~80% while bounding out-of-band DB drift |
| Admin Revoked `jti` | `<= 28,800s` | None | Matches exact remaining JWT `exp - now` |
| `/readyz` Public Counts & `/ai/status` | `30s` | None | Protects health/probe endpoints from polling overhead |
| `/admin/overview` | `15s` | None | Absorbs rapid admin tab switches; invalidated on writes |
| Rate Limit Buckets (`ZSET`) | `window_seconds` (`60s`) | None | Self-expiring sliding window |

---

## 7. Cache Invalidation Strategy

Every write transaction commits to **MySQL first**, and immediately after `db.commit()` triggers deterministic invalidation:
1. **Listing Created / Moderated / Guardrail Case Decided:**
   - `INCR hl:ver:catalog`, `INCR hl:ver:artisans`, `INCR hl:ver:admin`
2. **Artisan Verification Submitted / Admin Approved or Rejected Seller:**
   - `INCR hl:ver:artisans`, `INCR hl:ver:catalog`, `INCR hl:ver:admin`, `DEL hl:auth:principal:clerk:{clerk_id}`, `DEL hl:auth:principal:admin:{user_id}`
3. **CraftProof Passport Created / Claim Added / Evidence Attached / Admin Claim Decision / AI Passport Audit:**
   - `INCR hl:ver:passports` (guarantees verified vs seller-declared claim badges are never stale after an Admin decision)
4. **User Sync (`/auth/sync`) or Retail Order Created (`/orders/retail`):**
   - `DEL hl:auth:principal:clerk:{clerk_id}` and `INCR hl:ver:admin`
5. **Admin Logout (`/auth/admin-logout`):**
   - `SETEX hl:auth:revoked_jti:{jti} <remaining_ttl> "1"` and `DEL hl:auth:principal:admin:{user_id}`

---

## 8. Expected Performance Benefits

- **Storefront Initial Load (`/` & `/artisans`):** Reduces MySQL queries per visitor load from **~115+ SQL queries** down to **0 SQL queries on cache hit** (~1–2 ms Redis read) and **~9 batched SQL queries on cache miss** (~92% fewer DB queries on miss, ~99% fewer on hit).
- **Product & CraftPassport Pages (`/product` + `/passport/:code`):** Eliminates 12+ SQL queries + SVG QR rendering per PDP view on cache hit.
- **Authenticated Burst Hydration:** Eliminates 3–5 RBAC JOIN queries per API call when `StoreContext` or `AdminPage` fires 4–6 parallel authenticated requests.
- **Multi-Worker Scalability:** Rate limits (`429 Too Many Requests`) and Admin session revocations apply uniformly across multiple Uvicorn/Gunicorn workers.

---

## 9. Potential Risks & Compatibility Concerns

1. **Redis Offline in Local Dev / CI:**
   - *Mitigation:* Short socket timeout (`0.5s`) + `15s` in-process circuit breaker so an unreachable Redis server adds `0ms` latency after initial detection and falls back seamlessly to MySQL and the in-memory rate limiter. Existing `80` pytest tests remain 100% green without requiring a running Redis daemon.
2. **Monetary `Decimal` Precision:**
   - *Mitigation:* Use Pydantic v2 `TypeAdapter` / `model_dump(mode="json")` & `model_validate_json()` so `Decimal("14500.00")` never loses precision through `float` conversion.
3. **Trust & RBAC Consistency:**
   - *Mitigation:* Post-commit `O(1)` version invalidation (`hl:ver:*`) + short `45s` TTL on RBAC principals ensures MySQL remains the single source of truth.

---

## 10. Required Dependencies & Infrastructure Changes

- **Python Dependency (`backend/requirements.txt`):** `redis==5.2.1`
- **Frontend Dependencies (`app/package.json`):** None
- **Alembic Migrations (`backend/alembic/`):** None (100% compatible with existing MySQL 8.4 schema)
- **Environment Variables (`backend/.env.example`):**
  ```env
  REDIS_ENABLED=true
  REDIS_URL=
  REDIS_HOST=127.0.0.1
  REDIS_PORT=6379
  REDIS_DB=0
  REDIS_PASSWORD=
  REDIS_SSL=false
  REDIS_KEY_PREFIX=hl
  REDIS_SOCKET_TIMEOUT_SECONDS=0.5
  ```
