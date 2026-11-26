# HunarLink Backend (`FastAPI` + `SQLAlchemy 2.x` + `Alembic` + `MySQL 8.4 LTS`)

Standalone-ready backend implementing:
1. **ASIGS (Advanced Seller Input Guardrail System)** across all 10 server-side layers for Direct Sellers, Suppliers, Wholesale Dealers, Private Documents, GI vs Non-GI Verification, Commercial Validation, Inventory Isolation, Duplicate Escalation, Ownership/State Machines, and the Admin Guardrail Center.
2. **Razorpay Standard Checkout Payment Gateway** for India (`INR`) Retail and Wholesale orders, with server-side `Decimal` -> integer paise recalculation, HMAC SHA-256 verification, raw-body idempotent webhooks, permissioned full/partial refunds, and strict separation from COD and Supplier-to-Dealer procurement obligations.

> **Important Honesty & Readiness Notice**
> - Automated tests (`pytest`) run against an isolated SQLite in-memory database derived from the MySQL-aligned SQLAlchemy models and a mocked Razorpay client (`FakeRazorpayGateway`).
> - Passing mocked tests proves application logic, validation, signatures, idempotency, and RBAC — it does **not** replace running migrations against a live **MySQL 8.4 LTS** instance or completing end-to-end **Razorpay Test Mode** and **Live Mode** verification with real merchant credentials.
> - Razorpay **Standard Checkout** is **not** escrow and **not** Razorpay Route automated split settlement.

---

## 1. Directory Structure

```text
backend/
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       ├── 0001_hunarlink_mysql_baseline.py   # Anchors the 95-table MySQL baseline
│       └── 0002_add_asigs_guardrail_tables.py # Adds 6 ASIGS guardrail tables
├── app/
│   ├── main.py                                # FastAPI app, CORS allowlist, headers, routers
│   ├── core/
│   │   ├── config.py                          # Pydantic-settings + MySQL & Redis env config
│   │   ├── database.py                        # Sync SQLAlchemy 2.x engine + SessionLocal
│   │   ├── redis_client.py                    # Redis connection pool, health check & 15s circuit breaker
│   │   ├── cache.py                           # Read-through cache, O(1) version invalidation, stampede lock, jti revocation
│   │   ├── auth.py                            # Clerk RS256 JWKS auth + short-TTL RBAC cache + MySQL lookup
│   │   ├── admin_security.py                  # PBKDF2-HMAC-SHA256 + HS256 Admin JWT (`jti` revocation support)
│   │   ├── security.py                        # Correlation IDs, headers, redaction, Redis ZSET rate limiter
│   │   └── audit.py                           # Append-only audit_logs writer
│   ├── models/
│   │   ├── base.py                            # UUIDChar (CHAR(36) ascii_bin), UTCDateTime
│   │   ├── core_models.py                     # MySQL 8.4 baseline tables (Modules A–H)
│   │   ├── guardrail_models.py                # 6 ASIGS tables
│   │   └── craftproof_models.py               # CraftProof Passports, Claims, Evidence, Demand Bridge & AI Logs
│   ├── integrations/razorpay/
│   │   ├── client.py                          # Official razorpay SDK wrapper + timeouts
│   │   ├── signatures.py                      # Constant-time Checkout & Webhook HMAC SHA-256
│   │   ├── schemas.py                         # Exact Decimal rupees <-> integer paise
│   │   └── exceptions.py                      # Timeout / Gateway / Signature errors
│   └── modules/
│       ├── auth/                              # Clerk sync, check-account, Artisan Card submission, Admin login
│       ├── storefront/                        # Live DB catalog, verified artisans, Seller Studio, Admin Console
│       ├── guardrails/                        # Layers 1–10 + Admin Guardrail Center + File Security Scans
│       ├── craftproof/                        # Digital Craft Passports, QR SVG generation & Evidence Ledger
│       ├── ai/                                # Artisan Copilot, Doc Pre-Screen, Craft Audit & Buyer Assistant
│       ├── demand_bridge/                     # B2B Bulk Demand Parser & Artisan Cluster Capacity Matcher
│       └── payments/                          # Checkout, Verify, Webhook, Refunds, Admin Ops
├── docs/
│   ├── asigs_guardrails_architecture.md
│   ├── redis_setup_windows.md                 # Windows & local Redis setup, keys, TTLs & fallback guide
│   └── payments/                              # 8 Razorpay engineering & go-live docs
├── tests/
│   ├── conftest.py
│   ├── test_auth_sync.py                      # Auth, RBAC, Artisan Card staging & Admin approval tests
│   ├── test_storefront_integration.py         # Live catalog, UUID security & retail checkout tests
│   ├── test_craftproof_ai_demand_bridge.py    # CraftProof Passports, AI & B2B Demand Bridge tests
│   ├── test_redis_integration.py              # Redis caching, invalidation, rate limiting, jti & fallback tests
│   ├── test_asigs_guardrails.py               # 21 ASIGS automated tests
│   └── test_razorpay_payments.py              # 30 Razorpay automated tests
├── .env.example
├── pytest.ini
└── requirements.txt
```

---

## 2. Quick Start (Local Development & Testing)

### Install Dependencies
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Run Automated Test Suite (91 Tests)
```bash
cd backend
pytest -v
```
- **Redis Setup (Windows / WSL2 / Docker / Memurai):** See [`docs/redis_setup_windows.md`](docs/redis_setup_windows.md). FastAPI automatically falls back to MySQL and in-process rate limiting when Redis is not running.
- **Exported API Collection:** See `../docs/api/HunarLink_Round3.postman_collection.json` and `../docs/api/openapi.json` (plus live Swagger UI at `http://localhost:8000/docs`).

### Verify MySQL 8.4 LTS Alembic DDL Offline (No Live DB Needed)
```bash
cd backend
alembic upgrade 0001_hunarlink_mysql_baseline:head --sql
```

### Apply to a Live MySQL 8.4 LTS Database
1. First install the 95-table baseline schema from `../hunarlink-database/hunarlink_mysql_full_install.sql`.
2. Copy `backend/.env.example` to `backend/.env` and set real MySQL, Clerk, and Razorpay **Test Mode** credentials.
3. Stamp the baseline and apply the 6 ASIGS guardrail tables:
```bash
cd backend
alembic stamp 0001_hunarlink_mysql_baseline
alembic upgrade head
```

### Run the FastAPI Server
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 3. Core API Surface (`/api/v1`)

| Domain | Method & Path | Access |
|---|---|---|
| Health | `GET /healthz`, `GET /readyz` | Public (redacted, zero secrets) |
| Seller Guardrails | `POST /api/v1/seller/listings/validate`, `POST /api/v1/seller/listings` | Clerk JWT + `DIRECT_SELLER` |
| Supplier Guardrails | `POST /api/v1/supplier/lots/validate`, `POST /api/v1/supplier/lots`, `GET /api/v1/supplier/lots/{lot_id}` | Clerk JWT + `SUPPLIER` (owner or admin) |
| Dealer Guardrails | `POST /api/v1/dealer/profile/validate`, `POST /api/v1/dealer/wholesale-listings/validate`, `POST /api/v1/dealer/assignments/{id}/respond` | Clerk JWT + `DEALER` |
| Document Security | `POST /api/v1/guardrails/documents/upload`, `GET /api/v1/guardrails/documents/{scan_id}` | Clerk JWT (owner or authorized Admin) |
| GI Verification Gate | `POST /api/v1/guardrails/verification/assess` | Clerk JWT (owner or reviewer; Non-GI never invokes GI LLM) |
| Admin Guardrails | `GET /api/v1/admin/guardrail/cases`, `GET /api/v1/admin/guardrail/cases/{id}`, `POST /api/v1/admin/guardrail/cases/{id}/decision`, `GET /api/v1/admin/guardrail/rules` | Clerk JWT + Admin RBAC (`guardrails.read` / `guardrails.decide`) |
| Razorpay Checkout | `POST /api/v1/payments/razorpay/create-order`, `POST /api/v1/payments/razorpay/verify` | Clerk JWT (order owner) |
| Payment Status | `GET /api/v1/payments/{payment_id}`, `GET /api/v1/orders/{order_scope}/{order_id}/payment-status` | Clerk JWT (payer or Admin) |
| Razorpay Webhook | `POST /api/v1/webhooks/razorpay` | Raw-body HMAC SHA-256 (`RAZORPAY_WEBHOOK_SECRET`) + `x-razorpay-event-id` |
| Refunds | `POST /api/v1/payments/{payment_id}/refund` | Clerk JWT + Admin RBAC (`payments.refund`) |
| Admin Payments | `GET /api/v1/admin/payments`, `GET /api/v1/admin/payments/{id}`, `GET /api/v1/admin/payment-webhooks`, `GET /api/v1/admin/refunds` | Clerk JWT + Admin RBAC (`payments.read`) |
