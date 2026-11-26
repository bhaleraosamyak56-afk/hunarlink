# HunarLink — Backend Architecture Specification

**Platform:** HunarLink (Valley Craft Guild) — Authenticity-First Jammu & Kashmir Handicrafts Marketplace & Provenance Platform  
**Backend Stack:** Python 3.11+ · FastAPI · SQLAlchemy 2.x · Alembic · MySQL 8.0/8.4 LTS · Redis · Clerk RS256 JWKS · Razorpay Standard Checkout · Local Ollama / Cloud AI Gateway  
**API Prefix:** `/api/v1` · **Automated Verification:** `92/92` Passing Integration & Security Tests (`pytest`)

---

## 1. Executive Overview & Architectural Principles

The HunarLink backend is a modular, monolith-first **FastAPI** application engineered around five non-negotiable architectural invariants:

1. **MySQL 8.4 LTS as the Single ACID Source of Truth:** Every permanent business entity — identity accounts, verified artisan profiles, catalog products, inventory reservations, retail and wholesale orders, Razorpay payment attempts, webhook ledgers, refunds, guardrail cases, CraftProof provenance claims, and append-only audit logs — is persisted in **MySQL 8.0/8.4 LTS** using strict foreign keys, `CHECK` constraints, and `DECIMAL(12,2)` monetary precision.
2. **Redis as a High-Speed, Fault-Tolerant Acceleration & Guard Layer:** Redis sits in front of MySQL to serve read-heavy catalog, artisan, and QR Craft Passport traffic in ~1 ms (**0 SQL queries on cache hit**), enforce multi-worker sliding-window rate limits (`ZSET`), coordinate single-flight cache stampede locks, and blocklist signed-out Admin JWT `jti` tokens — backed by a **15-second circuit breaker** that degrades gracefully to MySQL and in-memory limiters if Redis is offline.
3. **Strict 3-Table Identity Isolation (`buyer_accounts`, `artisan_accounts`, `admin_accounts`):** Every email address maps to at most **one** dedicated identity table. Buyers and Artisans authenticate via **Clerk RS256 JWKS** tokens, while Administrators authenticate exclusively through DB-provisioned **PBKDF2-HMAC-SHA256** credentials (`admin_credentials`) and isolated **HS256 session JWTs** (`iss="hunarlink-admin"`). Self-registration can never grant `ADMIN` privileges or self-approve seller verification.
4. **Human-Only Legal Provenance & 10-Layer Anti-Counterfeit Guardrails (ASIGS):** Sellers can only submit `SELLER_DECLARED` claims and staged (`DRAFT` / `SUBMITTED`) verification applications. AI workflows (`LocalAIGateway`) operate strictly as **advisory tools** (`is_legal_proof=False`, enforced both in Python and by MySQL `CHECK` constraints); only authenticated human Administrators with explicit RBAC permissions can promote an artisan to `APPROVED` or mark a CraftProof claim `HUMAN_VERIFIED` / `THIRD_PARTY_VERIFIED`.
5. **Server-Authoritative Commerce & Short-Lock Payment Safety:** Client payloads cannot supply prices, discounts, currency overrides, or seller IDs. All order totals are recomputed server-side in `Decimal` rupees and converted to exact integer paise (`₹14,500.00 -> 1450000`), and database locks are never held open across outbound Razorpay or LLM network calls.

---

## 2. High-Level System Topology

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT & EDGE LAYER (React 19 + Vite SPA :5173)                       │
│  Storefront · Artisan Onboarding · Seller Studio · Passport QR Viewer · B2B Portal · /admin   │
└───────────────────────────────┬───────────────────────────────────────────────┬───────────────┘
                                │ HTTPS / Vite Proxy (/api/*, /healthz, /readyz)│ SSE (/api/chat*)
                                ▼                                               ▼
┌───────────────────────────────────────────────────────────────┐   ┌───────────────────────────┐
│             FASTAPI BACKEND APPLICATION (:8000)               │   │  HunarSathi Chatbot (:5050│
│                                                               │   │  Optional Streaming SSE   │
│  1. Middleware Pipeline                                       │   │  Gemini Flash + Fallback  │
│     • CorrelationAndHeadersMiddleware (X-Correlation-ID,      │   └───────────────────────────┘
│       nosniff, X-Frame-Options: DENY, Cache-Control: no-store)│
│     • Strict CORSMiddleware (explicit origin allowlist)       │
│                                                               │
│  2. Security, Auth & Rate-Limiting Core (`app/core/`)         │
│     • Dual Auth: Clerk RS256 JWKS + Admin HS256 JWT (`jti`)   │
│     • SlidingWindowRateLimiter (Redis ZSET -> deque fallback) │
│     • Short-TTL RBAC Principal Cache (45s)                    │
│                                                               │
│  3. Domain Modules (`app/modules/` under `/api/v1`)           │
│     ┌──────────────┬──────────────┬──────────────┬──────────┐ │
│     │ auth         │ storefront   │ guardrails   │ payments │ │
│     │ Sync & RBAC  │ Catalog/Ord  │ 10-Layer     │ Razorpay │ │
│     ├──────────────┼──────────────┼──────────────┼──────────┤ │
│     │ craftproof   │ ai           │ demand_bridge│ webhooks │ │
│     │ QR Passports │ Ollama/Cloud │ B2B Clusters │ HMAC Raw │ │
│     └──────────────┴──────────────┴──────────────┴──────────┘ │
└───────────┬───────────────────────────┬───────────────────────┘
            │ Read-Through / ZSET / Lock│ SQLAlchemy 2.x Sync Pool (`pool_pre_ping=True`)
            ▼                           ▼
┌───────────────────────────┐   ┌───────────────────────────────────────────────────────────────┐
│      REDIS (:6379)        │   │             MYSQL 8.0 / 8.4 LTS (Primary Truth)               │
│ • Versioned JSON Caches   │   │ • 3 Account Tables + RBAC + Seller Verification & GI Registry │
│ • O(1) `hl:ver:*` Invalid.│   │ • Products, Variants, Listings, Warehouses & Atomic Stock     │
│ • ZSET Rate Limiters      │   │ • Retail/Wholesale Orders, Razorpay Payments, Webhooks, Refund│
│ • Stampede Single-Flight  │   │ • 6 ASIGS Guardrail Tables + Quarantined File Scan Metadata   │
│ • Admin `jti` Denylist    │   │ • 7 CraftProof & Demand Bridge Tables + AI & Security Audits  │
└───────────────────────────┘   └───────────────────────────────────────────────────────────────┘
            │                                                   │
            └───────────────► External / Local Integrations ◄───┘
                              • Clerk JWKS Endpoint (RS256 Identity Verification)
                              • Razorpay Orders, Payments, Refunds & HMAC SHA-256 Webhooks
                              • Local Ollama (`qwen2.5:3b`) / Groq / Gemini + Deterministic Fallback
                              • Private Quarantined Upload Store (`./var/private_uploads`)
```

---

## 3. Repository & Backend Package Structure (`backend/`)

```text
backend/
├── alembic.ini                              # Alembic migration configuration
├── pytest.ini                               # Pytest test runner configuration
├── requirements.txt                         # Pinned Python 3.11+ dependencies
├── .env.example                             # Environment template (zero hardcoded secrets)
├── alembic/
│   ├── env.py                               # SQLAlchemy metadata & MySQL URL wiring
│   └── versions/
│       ├── 0001_hunarlink_mysql_baseline.py         # Anchors 95-table MySQL 8.4 baseline
│       ├── 0002_add_asigs_guardrail_tables.py       # Adds 6 ASIGS guardrail & scan tables
│       ├── 0003_add_admin_credentials.py            # Adds PBKDF2 admin_credentials table
│       ├── 0004_add_craftproof_and_demand_bridge.py # Adds 7 CraftProof & Demand Bridge tables
│       └── 0005_add_ai_interaction_logs.py          # Adds ai_interaction_logs audit table
├── app/
│   ├── main.py                              # FastAPI app factory, lifespan, middleware, /healthz, /readyz
│   ├── core/
│   │   ├── config.py                        # Typed `Settings` (pydantic-settings + URL.create())
│   │   ├── database.py                      # Sync SQLAlchemy Engine (`pool_size=10`, `max_overflow=20`)
│   │   ├── redis_client.py                  # Pooled Redis client, ping health & 15s circuit breaker
│   │   ├── cache.py                         # Read-through cache, TypeAdapter JSON, O(1) invalidation, jti
│   │   ├── account_tables.py                # 3-table separation (`buyer/artisan/admin_accounts`) & backfill
│   │   ├── auth.py                          # Clerk RS256 JWKS verifier + Admin JWT + RBAC resolution
│   │   ├── admin_security.py                # PBKDF2-HMAC-SHA256 (390k iter) + HS256 Admin session JWT
│   │   ├── security.py                      # Correlation IDs, security headers, redaction, ZSET rate limiter
│   │   └── audit.py                         # Immutable `audit_logs` helper with automatic secret redaction
│   ├── models/
│   │   ├── base.py                          # `UUIDChar` (`CHAR(36) ascii_bin`), `UTCDateTime`, `Base`
│   │   ├── core_models.py                   # Identity, RBAC, Sellers, Catalog, Stock, Orders, Payments
│   │   ├── guardrail_models.py              # `GuardrailRule`, `GuardrailCheck`, `GuardrailCase`, `FileSecurityScan`
│   │   └── craftproof_models.py             # `CraftPassport`, `CraftProductClaim`, `BuyerDemandRequest`, `AIInteractionLog`
│   ├── integrations/razorpay/
│   │   ├── client.py                        # Official `razorpay` SDK gateway protocol & timeout wrapper
│   │   ├── signatures.py                    # Constant-time `hmac.compare_digest` for Checkout & Webhooks
│   │   ├── schemas.py                       # Exact `Decimal` INR <-> integer paise conversion DTOs
│   │   └── exceptions.py                    # Typed `RazorpayTimeoutError`, `RazorpayGatewayError`, etc.
│   └── modules/
│       ├── auth/                            # User sync, account-check, artisan onboarding, addresses, admin login/logout
│       ├── storefront/                      # Public catalog, verified artisans, Seller Studio, retail orders, Admin Console
│       ├── guardrails/                      # 10-layer ASIGS validation, private uploads, GI gate, Admin case decisions
│       ├── craftproof/                      # Public Digital Craft Passports, claims, evidence, SVG QR codes
│       ├── ai/                              # Local Ollama / cloud AI gateway + 4 craft advisory workflows
│       ├── demand_bridge/                   # Wholesale NLP brief parser + deterministic multi-artisan cluster matcher
│       └── payments/                        # Razorpay order creation, signature verify, raw webhooks, Admin refunds
├── scripts/                                 # MySQL setup, 53-artisan/96-listing seeder, Admin account provisioning
├── docs/                                    # ASIGS architecture, 8 Razorpay runbooks & Windows Redis setup guide
└── tests/                                   # 92 isolated integration, security, payment, AI & Redis tests
```

---

## 4. Authentication, Identity Isolation & RBAC Architecture

### 4.1 Strict 3-Table Account Separation (`account_tables.py`)
HunarLink enforces physical table separation and a **strict 1-account-type-per-email invariant**:
- **`buyer_accounts`:** Retail collectors and B2B buyers authenticated via Clerk (`CUSTOMER` role; `DIRECT_SELLER` and `ADMIN` stripped).
- **`artisan_accounts`:** Kashmiri craftspeople and workshops authenticated via Clerk (`DIRECT_SELLER` + `CUSTOMER` roles; `ADMIN` stripped).
- **`admin_accounts`:** Platform administrators provisioned strictly via backend CLI scripts (`scripts/create_admin_account.py`), never via public sign-up.
- Attempting to register or sign in with an email already bound to a different account table returns **`HTTP 409 Conflict`**. Legacy databases containing pre-existing `users` rows are deterministically backfilled without data loss.

### 4.2 Dual Token Verification Pipeline (`auth.py` & `admin_security.py`)
Every protected request passes through `get_current_principal()`:
1. **Path 1 — Dedicated Administrator HS256 Session JWT (`iss="hunarlink-admin"`):**
   - Issued exclusively by `POST /api/v1/auth/admin-login` after constant-time `PBKDF2-HMAC-SHA256` (`390,000` iterations) verification against `admin_credentials`.
   - Carries `sub`, `email`, `token_type="admin_password_session"`, `jti` (unique UUID), `iat`, and `exp` (default `28,800s` / 8 hours).
   - Checked against the Redis revocation key `hl:auth:revoked_jti:{jti}` (populated immediately on `POST /api/v1/auth/admin-logout`), then validated against `admin_accounts`, `admin_credentials.is_active`, `admin_profiles`, and granular `admin_permissions` (cached in Redis for `45s`).
2. **Path 2 — Buyer & Artisan Clerk RS256 Session JWT:**
   - Verified cryptographically against Clerk's JWKS endpoint (`PyJWKClient` cached per process) checking RS256 signature, `iss`, optional `aud`, and `exp` with 30s clock-skew leeway.
   - `claims["sub"]` resolves the caller's `AuthenticatedPrincipal` from `buyer_accounts` or `artisan_accounts` + `user_role_assignments` (cached in Redis for `45s`, invalidated immediately on `/auth/sync`, `/auth/artisan-verification`, or Admin status changes).

### 4.3 Role & Permission Matrix
| Role / Permission | Scope & Enforced Capabilities |
|---|---|
| `CUSTOMER` | Create retail orders, initiate/verify own Razorpay payments, manage own addresses |
| `DIRECT_SELLER` | Validate/publish listings (when `SellerProfile` is `APPROVED` + `ACTIVE`), manage own CraftPassports, respond to Demand Bridge cluster offers |
| `SUPPLIER` | Validate/create raw-material or craft supplier lots (`supplier_lots`), view own lots |
| `DEALER` | Validate dealer profiles & wholesale listings, respond to supplier assignments |
| `guardrails.read` / `guardrails.decide` | Inspect ASIGS guardrail cases, approve/reject artisan applications, moderate listings |
| `payments.read` / `payments.refund` | Access `/admin/overview`, payment/webhook ledgers, and issue full/partial Razorpay refunds |
| `procurement.read` | Audit supplier lots and B2B procurement records across workshops |

---

## 5. Database Schema & Persistence Architecture (`MySQL 8.0/8.4 LTS`)

- **Connection Management (`core/database.py`):** Synchronous SQLAlchemy 2.x `Engine` built via `URL.create(drivername="mysql+pymysql", ...)` (safe for special characters in passwords) with `pool_size=10`, `max_overflow=20`, `pool_recycle=1800`, and `pool_pre_ping=True`.
- **Type Discipline (`models/base.py`):** Primary and foreign keys use `UUIDChar` (`CHAR(36)` with `ascii_bin` collation on MySQL for compact, fast index scans); timestamps are normalized to UTC (`UTCDateTime`); all prices and stock quantities use exact fixed-point `Numeric` (`DECIMAL(12,2)` and `DECIMAL(12,3)`).

| Domain Group | Key MySQL Tables | Architectural Role |
|---|---|---|
| **Identity & RBAC** | `buyer_accounts`, `artisan_accounts`, `admin_accounts`, `users`, `user_addresses`, `platform_roles`, `user_role_assignments`, `admin_profiles`, `admin_roles`, `admin_permissions`, `admin_credentials` | 3-table isolated identity, PBKDF2 admin auth, fine-grained RBAC |
| **Seller Verification & GI** | `seller_profiles`, `seller_verification_applications`, `seller_documents`, `gi_reference_records`, `product_gi_claims`, `gi_verification_runs` | Dual-track (`GI` vs `NON_GI`) artisan onboarding & official GI Registry reference |
| **Catalog & Inventory** | `categories`, `products`, `product_images`, `product_variants`, `seller_product_listings`, `supplier_profiles`, `supplier_lots`, `dealer_profiles`, `dealer_wholesale_listings`, `warehouses`, `warehouse_stock` | Marketplace catalog, B2B supply lots, optimistic-versioned warehouse stock |
| **Orders & Fulfilment** | `retail_orders`, `seller_fulfilment_groups`, `retail_order_items`, `wholesale_buyer_profiles`, `wholesale_rfqs`, `dealer_quotes`, `wholesale_orders`, `wholesale_order_items` | Multi-seller retail order splitting & B2B RFQ/direct wholesale orders |
| **Payments & Webhooks** | `payments`, `payment_attempts`, `payment_status_history`, `payment_webhook_events`, `refunds` | Server-authoritative Razorpay ledger, idempotency keys, raw webhook deduplication |
| **ASIGS Guardrails** | `guardrail_rules`, `guardrail_checks`, `guardrail_cases`, `guardrail_case_events`, `file_security_scans`, `input_fingerprints` | 10-layer validation telemetry, SHA-256 duplicate detection, quarantined uploads |
| **CraftProof & Demand Bridge** | `craft_passports`, `craft_product_claims`, `craft_claim_evidence`, `craft_verification_events`, `artisan_capabilities`, `buyer_demand_requests`, `demand_artisan_matches` | QR provenance ledger, `SELLER_DECLARED` vs `HUMAN_VERIFIED` separation, B2B cluster pooling |
| **Immutable Audit Trails** | `audit_logs`, `ai_interaction_logs` | Redacted security/moderation audit trail & full LLM prompt/output accountability |

---

## 6. Redis Caching, Rate-Limiting & Resilience Layer

| Component | Key Pattern (`REDIS_KEY_PREFIX=hl`) | Redis Type & TTL | Invalidation & Fallback Behavior |
|---|---|---|---|
| **Domain Version Counters** | `hl:ver:{catalog\|artisans\|passports\|admin}` | `STRING` (monotonic int) | Incremented via `O(1)` `INCR` post-`db.commit()` (never uses blocking `KEYS *`) |
| **Storefront Catalog** | `hl:cache:catalog:v{ver}:list:{cat}:lim{n}` / `...:item:{id}` | `STRING` JSON (`300s` / `600s` ±10%) | Pydantic `TypeAdapter` preserves `Decimal`; invalidated on listing/seller/claim edits |
| **Verified Artisans** | `hl:cache:artisans:v{ver}:list` / `...:detail:{id}` | `STRING` JSON (`300s` / `600s` ±10%) | Unverified probes are **never** cached and always log `AuditLog` in MySQL |
| **CraftProof & QR SVG** | `hl:cache:passports:v{ver}:code:{code}`, `hl:cache:qr:v1:...` | `STRING` JSON/SVG (`600s` / `24h`) | Invalidated on passport create, seller claim/evidence add, AI audit, Admin decision |
| **RBAC Principal Cache** | `hl:auth:principal:{clerk\|admin}:{id}` | `STRING` JSON (`45s`) | Non-sensitive roles/permissions only; evicted on sync, onboarding, or Admin action |
| **Admin `jti` Denylist** | `hl:auth:revoked_jti:{jti}` | `STRING` (`exp - now`) | Written on `POST /api/v1/auth/admin-logout` (+ bounded local fallback map) |
| **Probe & Admin Snapshots** | `hl:cache:readyz:v{ver}:counts`, `hl:cache:ai:status`, `hl:cache:admin:v{ver}:overview` | `STRING` JSON (`30s` / `30s` / `15s`) | `/readyz` still runs live `SELECT 1` DB check on every call |
| **Sliding-Window Limiter** | `hl:rl:{scope}:{actor_or_ip}` | `ZSET` (`60s` window) | Single-round-trip `MULTI/EXEC` pipeline; falls back to thread-safe `deque` |
| **Stampede Single-Flight** | `hl:lock:{sha1_digest}` | `STRING` (`NX PX 3000`) | Coalesces concurrent cold-cache misses into a single MySQL query |

---

## 7. Domain Modules & Complete API Surface

### 7.1 Health & Readiness (`main.py`)
- `GET /` — Service metadata and route pointers.
- `GET /healthz` — Liveness probe (`200 OK`, UTC timestamp).
- `GET /readyz` — Readiness probe executing live `SELECT 1` on MySQL, Redis `PING` probe (`"connected" | "unavailable" | "disabled"`), cached public artisan/listing counts, and non-sensitive integration flags (`503` if MySQL is unreachable).

### 7.2 Authentication & Onboarding (`modules/auth/router.py`)
- `POST /api/v1/auth/check-account` (`30/min` IP) — Pre-auth email existence & verification status check across dedicated account tables.
- `POST /api/v1/auth/sync` (`20/min` IP, Clerk RS256 JWT) — Upserts caller into `buyer_accounts` or `artisan_accounts`, enforcing strict 1-account-type-per-email (`409` on cross-role collision, `404` on unregistered `signin`).
- `GET /api/v1/auth/me` — Authenticated caller profile, RBAC roles, and `SellerProfileBrief`.
- `POST /api/v1/auth/artisan-verification` — Stages `GI` or `NON_GI` artisan onboarding (`SUBMITTED` / `DRAFT`), linking quarantined Artisan Card scans (`FileSecurityScan`).
- `GET / POST / DELETE /api/v1/auth/addresses[/{address_id}]` — Authenticated customer shipping address management.
- `POST /api/v1/auth/admin-login` (`5/min` IP+email) — PBKDF2-HMAC-SHA256 verification issuing a signed HS256 Admin JWT with `jti`.
- `POST /api/v1/auth/admin-logout` — Revokes Admin JWT `jti` in Redis, evicts cached principal, and writes `ADMIN_LOGOUT` to `audit_logs`.

### 7.3 Storefront, Seller Studio, Orders & Admin Console (`modules/storefront/router.py`)
- `GET /api/v1/catalog/products` — Batched, Redis-cached active marketplace listings (`User/ArtisanAccount ACTIVE` + `SellerProfile APPROVED & ACTIVE` + `Product APPROVED` + `Listing ACTIVE`), guarded by prohibited-content screening on `?q=`.
- `GET /api/v1/catalog/product?id=` & `GET /api/v1/catalog/products/{identifier}` (`180/min` IP) — UUID/slug validated single listing detail.
- `GET /api/v1/artisans` — Batched (`<= 5` SQL queries on miss, `0` on hit) verified artisan directory.
- `GET /api/v1/artisans/detail?id=` & `GET /api/v1/artisans/{identifier}` (`120/min` IP) — Verified artisan workshop & listings; probes against unverified/draft seller UUIDs return `404` and write `ARTISAN_ENDPOINT_BLOCKED_UNVERIFIED_ID` to `audit_logs`.
- `POST /api/v1/orders/retail` & `GET /api/v1/orders/retail/my` — Server-recalculated INR `RetailOrder` + per-workshop `SellerFulfilmentGroup` creation (`RAZORPAY_STANDARD` vs `COD`).
- `GET /api/v1/seller/studio/listings`, `POST /api/v1/seller/studio/validate`, `POST /api/v1/seller/studio/listings` — Artisan Studio dry-run & live publish across all 10 ASIGS layers + automatic CraftProof passport initialization.
- `GET /api/v1/admin/overview`, `POST /api/v1/admin/listings/{id}/moderate`, `POST /api/v1/admin/artisan-applications/{id}/decision`, `POST /api/v1/admin/sellers/{id}/verify` — Real-time Admin moderation and artisan promotion endpoints with post-commit cache invalidation.

### 7.4 ASIGS 10-Layer Seller Input Guardrail System (`modules/guardrails/`)
Evaluates every seller listing (`POST /api/v1/seller/listings*`), supplier lot (`POST /api/v1/supplier/lots*`), dealer profile/wholesale listing (`POST /api/v1/dealer/*`), GI assessment (`POST /api/v1/guardrails/verification/assess`), and private upload (`POST /api/v1/guardrails/documents/upload`, `15/min`):
1. **Layer 1 (Auth & Account State):** Active principal + verified profile status.
2. **Layer 2 (Safe Text & Encoding):** Unicode normalization, script/HTML/SQLi payload rejection, benign Kashmiri/Hindi/Urdu preservation.
3. **Layer 3 (Content & Contraband Safety):** Blocks wildlife contraband (e.g., Shahtoosh / Chiru antelope / ivory) and off-platform contact leakage while allowing legitimate Pashmina/Kani craft terms.
4. **Layer 4 (File Quarantine & Magic Bytes):** Inspects raw PDF/JPEG/PNG/WEBP magic bytes, enforces `MAX_UPLOAD_SIZE_BYTES` (`5 MB`), computes `SHA-256`, runs EICAR/malware scan hooks, and stores outside the web root (`./var/private_uploads`).
5. **Layer 5 (GI Anti-Self-Verification Gate):** Blocks seller attempts to self-assign `GI_VERIFIED` (`PROD_SELLER_CANNOT_SELF_VERIFY_GI`); escalates unverified GI claims to `REVIEW` cases; `NON_GI` sellers never invoke the GI LLM.
6. **Layer 6 (Commercial & Price Anomaly Bounds):** Enforces INR currency, `selling_price <= compare_at_mrp`, positive MOQ, and monotonic B2B tier pricing.
7. **Layer 7 (Inventory Isolation & Atomic Stock):** Separates supplier procurement from retail stock and uses optimistic version checks (`WarehouseStock.version`) to prevent overselling.
8. **Layer 8 (Input Fingerprinting & Duplicate Escalation):** Hashes normalized titles/SKUs into `input_fingerprints` to flag duplicate spam listings.
9. **Layer 9 (Ownership & State Machine Enforcement):** Prevents cross-seller ID spoofing (`assert_owner_or_admin`) and illegal state transitions.
10. **Layer 10 (Admin Guardrail Center):** Queues `REVIEW` / `ESCALATE` cases for human resolution (`GET / POST /api/v1/admin/guardrail/cases*`) with full `GuardrailCaseEvent` + `AuditLog` trails.

### 7.5 CraftProof Digital Passports & QR Provenance (`modules/craftproof/`)
- Public zero-login provenance endpoints: `GET /api/v1/passports/lookup`, `GET /api/v1/passports/by-product/{ref}`, `GET /api/v1/passports/{code}`, `GET /api/v1/passports/{code}/qr.svg` (pure-Python `segno` SVG QR generator).
- Strictly separates `verified_claims` (`HUMAN_VERIFIED`, `THIRD_PARTY_VERIFIED`) from `seller_declared_claims` (`SELLER_DECLARED`, `EVIDENCE_SUBMITTED`).
- Seller endpoints (`POST /api/v1/seller/passports/...`) can only create declarations and attach hashed evidence; only `POST /api/v1/admin/passports/claims/{claim_id}/decision` can legally verify or reject a claim.

### 7.6 Provider-Agnostic CraftProof AI Gateway (`modules/ai/`)
- `LocalAIGateway` (`provider.py`) supports **Local Ollama (`qwen2.5:3b`)**, **Groq (`llama-3.3-70b-versatile`)**, **Google Gemini (`gemini-2.0-flash-lite`)**, and **deterministic offline fallback** so every workflow succeeds even without GPU/API keys.
- Four rate-limited (`20/min`) advisory endpoints, all logged to `ai_interaction_logs` with `is_legal_proof=False` (enforced by DB `CHECK (is_legal_proof = 0)`):
  1. `POST /api/v1/ai/artisan-doc/prescreen` — Extracts text from uploaded PDFs (`pypdf`) / metadata and flags GI/district contradictions for Admin reviewers.
  2. `POST /api/v1/ai/artisan-copilot/draft` — Converts Hindi / Hinglish / Kashmiri-English artisan notes into structured catalog drafts + Fair-Craft labor/material breakdown without inventing unstated certifications.
  3. `POST /api/v1/ai/craft-audit/listing` — Adversarial craft economics audit catching impossible loom-hour/price/stock ratios (e.g., fake machine-loomed "Kani" shawls).
  4. `POST /api/v1/ai/buyer-assistant/ask` — Evidence-locked Q&A bound strictly to live MySQL `CraftPassport` rows.

### 7.7 B2B Wholesale Demand Bridge (`modules/demand_bridge/`)
- `POST /api/v1/demand-bridge/parse` (`20/min`) — Parses natural-language hospitality/corporate procurement briefs into structured specs (`category_slug`, `quantity`, `delivery_days`, `budget`, `gi_required`).
- `POST /api/v1/demand-bridge/match` (`20/min`) — Deterministically scores verified artisans by monthly capacity, craft specialty, GI verification, and lead time; when a bulk order exceeds any single workshop's capacity, automatically forms a **Multi-Artisan Cluster** pooling capacity across verified workshops.
- `POST /api/v1/demand-bridge/requests/{id}/dispatch-inquiries` & `GET / POST /api/v1/seller/demand-bridge/offers*` — Dispatches cluster allocations directly to each artisan's Seller Studio for acceptance/decline.

### 7.8 Razorpay Standard Checkout, Webhooks & Refunds (`modules/payments/`)
- **Two-Phase Short-Transaction Order Creation (`POST /api/v1/payments/razorpay/create-order`, `60/min`):**
  - *Tx 1:* Validates ownership (`CUSTOMER` / `WholesaleBuyerProfile`), blocks `COD` and supplier procurement orders, recalculates exact paise from MySQL, checks `X-Idempotency-Key`, and commits `Payment(status='INITIATED')` + `PaymentAttempt` *before* network I/O.
  - *Network Call:* Calls Razorpay Orders API outside any open DB transaction.
  - *Tx 2:* Transitions `Payment` to `ORDER_CREATED` (or `RECONCILIATION_REQUIRED` on timeout / `FAILED` on gateway rejection).
- **Signature Verification (`POST /api/v1/payments/razorpay/verify`):** Constant-time `HMAC-SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET)` + server-to-server `fetch_payment` cross-checking amount, currency (`INR`), and order ID before confirming fulfilment (`CAPTURE_VERIFIED` -> `PAID` + `CONFIRMED`).
- **Idempotent Raw-Body Webhooks (`POST /api/v1/webhooks/razorpay`):** Verified with separate `RAZORPAY_WEBHOOK_SECRET` over raw request bytes, deduplicated via unique `x-razorpay-event-id` (`payment_webhook_events`), and protected against out-of-order state downgrades (`payment.failed` can never overwrite `CAPTURED`).
- **Permissioned Refunds (`POST /api/v1/payments/{id}/refund`):** Requires `payments.refund` Admin permission, enforces cumulative refund ceiling (`<= captured_amount_paise`), supports idempotency keys, and writes `AuditLog`.

---

## 8. End-to-End Request Lifecycle Traces

### Trace A — Artisan Onboarding to Live Storefront Visibility
1. Artisan signs up via Clerk -> `POST /api/v1/auth/sync` creates an `ACTIVE` row in `artisan_accounts` + `DIRECT_SELLER` role.
2. Artisan uploads Artisan Card -> `POST /api/v1/guardrails/documents/upload` verifies magic bytes & SHA-256 into `file_security_scans` (`./var/private_uploads`).
3. `POST /api/v1/auth/artisan-verification` creates `SellerProfile(DRAFT, SUBMITTED)` + `SellerVerificationApplication(SUBMITTED)` (invisible on public `/artisans`; direct UUID probes return `404` + `AuditLog`).
4. Admin signs in (`POST /api/v1/auth/admin-login`), inspects the card (`GET /api/v1/guardrails/documents/{scan_id}`), and approves (`POST /api/v1/admin/artisan-applications/{id}/decision`) -> commits `APPROVED` + `ACTIVE` in MySQL and calls `invalidate_artisan_cache()` (`INCR hl:ver:artisans`, `hl:ver:catalog`, `hl:ver:admin`) + `invalidate_principal_cache()`, making the workshop immediately live.

### Trace B — Retail Checkout & Payment Settlement
1. Buyer submits cart -> `POST /api/v1/orders/retail` validates active listings & verified sellers, computes `Decimal` totals from MySQL, splits items into `SellerFulfilmentGroup`s, and commits `RetailOrder(PENDING, PENDING_PAYMENT)`.
2. `POST /api/v1/payments/razorpay/create-order` creates a Razorpay order in integer paise and returns only public `key_id` + `razorpay_order_id` (never secrets).
3. Buyer completes UPI/card payment -> `POST /api/v1/payments/razorpay/verify` (or async `POST /api/v1/webhooks/razorpay`) verifies HMAC + gateway payment state, marks `RetailOrder(PAID, CONFIRMED)`, and records `PaymentStatusHistory`.

---

## 9. Security Controls & Automated Test Coverage

- **HTTP & Input Hardening:** `X-Correlation-ID` tracing, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` in production, `Referrer-Policy: strict-origin-when-cross-origin`, `Cache-Control: no-store` on API responses, strict `TrustedHost` / CORS allowlists, Pydantic `extra="forbid"` DTOs, 100% parameterized SQLAlchemy 2.x queries, and recursive secret redaction (`redact_sensitive`) across logs and audit snapshots.
- **Automated Test Suite (`backend/tests/`, `92 passed`):**
  - `test_asigs_guardrails.py` (21 tests) — All 10 ASIGS layers, spoofed magic bytes, EICAR detection, prompt injection isolation, atomic stock reservation, Admin case decisions.
  - `test_razorpay_payments.py` (30 tests) — Paise math, tampering, idempotency, timeouts, HMAC verify, webhook deduplication, out-of-order protection, partial/full refunds.
  - `test_storefront_integration.py` (13 tests) — Catalog/artisan SQL seeding, UUID lookup guards, unverified probe auditing, Studio-to-Admin-to-Checkout lifecycle.
  - `test_auth_sync.py` (11 tests) — Clerk sync, 3-table Buyer/Artisan/Admin separation, cross-role collision blocking, PBKDF2 Admin login & revocation.
  - `test_craftproof_ai_demand_bridge.py` (9 tests) — CraftPassports, QR SVG, DB `CHECK` constraint blocking AI legal proof, Hinglish Copilot, adversarial Kani audit, multi-artisan cluster pooling.
  - `test_redis_integration.py` (8 tests) — 0-SQL cache hits, `Decimal` fidelity, post-commit `hl:ver:*` invalidation, Admin `jti` logout denylist, multi-worker ZSET rate limiting, stampede single-flight locking, and offline Redis circuit-breaker fallback.
