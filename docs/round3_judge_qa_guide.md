# Ananta Hackathon Round 3 — Judge Q&A & Live Demo Guide

This concise reference answers all **6 mandatory live-evaluation prompts** in Section 4 of the *Ananta Hackathon Round 3 Participant Guide*, plus file-by-file pointers when judges ask individual team members to open the codebase.

---

## 1. The Problem, Target User, and Core Task Solved
- **Problem:** Over 70% of items sold online as "Kashmiri Pashmina" or "handmade Kashmiri craft" are power-loom synthetic/viscose imitations sold by middlemen. Genuine karigars lose 40–60% of margin to intermediaries, while buyers have zero verifiable proof of origin.
- **Target Users:**
  1. **Grassroots & Master J&K Artisans** (Srinagar, Budgam, Anantnag, Ganderbal, Pulwama, etc.) — both GI-registered masters and standard government-card karigars.
  2. **Retail Collectors & B2B Hospitality/Bulk Buyers** seeking authentic, traceable Kashmiri handicrafts.
- **Core Task Solved:** Direct-from-workshop commerce backed by **database-enforced credential verification** (GI or Govt Artisan/Pehchan Card), **10-layer ASIGS anti-counterfeit listing guardrails**, **QR CraftProof Digital Passports**, **AI Artisan Copilot + B2B Demand Bridge**, and **Razorpay INR checkout**.

---

## 2. Tracing One Full Request End-to-End (Frontend -> Backend -> MySQL)

**Flow to demonstrate live: Artisan Registration -> Card Upload -> Admin Live Approval**

1. **Frontend UI (`app/src/pages/AuthPage.jsx` -> `submitVerification`)**:
   - Reads the Clerk RS256 session token via `await clerk.getToken()`.
   - Calls `uploadGuardrailDocument(cardFile, 'artisan_card', token)` -> `POST /api/v1/guardrails/documents/upload` (`app/src/services/apiClient.js`).
   - Calls `submitArtisanVerification(payload, token)` -> `POST /api/v1/auth/artisan-verification`.
2. **Backend Auth & Security Middleware (`backend/app/core/security.py` + `backend/app/core/auth.py`)**:
   - `CorrelationAndHeadersMiddleware` attaches a unique `X-Correlation-ID` and security headers.
   - `get_current_principal` verifies the Bearer JWT signature against Clerk's RS256 JWKS (`CLERK_JWKS_URL`) and resolves the caller's `users` row and `user_role_assignments` in MySQL.
3. **File Quarantine & Validation (`backend/app/modules/guardrails/router.py` & `service.py`)**:
   - Inspects file magic bytes (JPG/PNG/WebP/PDF), enforces `<5 MB` size cap, computes SHA-256 digest, runs malware scan, stores outside public webroot, and inserts a `FileSecurityScan` row (`CLEAN`).
4. **Database Staging (`backend/app/modules/auth/router.py` -> `submit_artisan_verification`)**:
   - Validates Pydantic schema `ArtisanVerificationSubmitRequest` (`422` if Standard Artisan omits `artisan_card_scan_id`).
   - Upserts `SellerProfile` with `verification_status='SUBMITTED'` and `profile_status='DRAFT'` (invisible to public `/api/v1/artisans` queries!).
   - Inserts `SellerVerificationApplication` (`HL-VER-...`) + `SellerDocument` + append-only `AuditLog`, then commits transaction to MySQL.
5. **Admin Decision (`app/src/pages/portal/AdminPage.jsx` -> `POST /api/v1/admin/artisan-applications/{id}/decision`)**:
   - Requires `require_admin_permission("guardrails.decide")`.
   - Promotes `SellerProfile` to `verification_status='APPROVED'`, `profile_status='ACTIVE'`, immediately making `/artisan?id=<uuid>` live on the storefront.

---

## 3. How Login, Roles, and Input Checks Work
- **Dual Identity Model (`backend/app/core/auth.py`):**
  - **Buyers & Artisans:** Clerk OAuth (Google/Apple), Email + 15-char Password, or 6-digit OTP -> verified server-side via RS256 JWKS (`POST /api/v1/auth/sync`). Duplicate sign-ups return `409 Conflict`; unregistered sign-ins return `404 Not Found`.
  - **Admins:** Provisioned strictly in MySQL `admin_credentials` (`PBKDF2-HMAC-SHA256` with 310,000 iterations) via `POST /api/v1/auth/admin-login` — zero hardcoded admin passwords in code.
- **Role-Based Access Control (RBAC):**
  - Stored in `platform_roles` + `user_role_assignments` (`CUSTOMER`, `DIRECT_SELLER`, `SUPPLIER`, `DEALER`, `SUPER_ADMIN`, `VERIFICATION_OFFICER`, `FINANCE_ADMIN`).
  - Protected routes enforce FastAPI dependencies (`Depends(get_current_principal)`, `Depends(require_roles(...))`, `Depends(require_admin_permission(...))`).
- **Input Validation & Attack Protection:**
  - **Pydantic v2** strict field bounds & regexes (`422 Unprocessable Entity` on bad payloads).
  - **SQL Injection:** 100% SQLAlchemy 2.x bound parameters (`select(User).where(...)`).
  - **XSS:** Content-Security-Policy headers, safe DOM `textContent` rendering in HunarSathi, and ASIGS text sanitization.
  - **Rate Limiting:** Per-IP `SlidingWindowRateLimiter` (`429 Too Many Requests` with `Retry-After`) on login and UUID lookup routes.

---

## 4. API Responses & Error Handling
- Consistent HTTP semantics:
  - `200 OK` / `201 Created` — typed Pydantic response models.
  - `400 Bad Request` / `422 Unprocessable Entity` — validation or guardrail rule block (returns structured `violations[]` in ASIGS).
  - `401 Unauthorized` / `403 Forbidden` — missing JWT, revoked credential, or insufficient RBAC permission.
  - `404 Not Found` — unregistered account or unverified artisan UUID probe (also recorded in `audit_logs`).
  - `409 Conflict` — duplicate registration or idempotency conflict.
  - `429 Too Many Requests` — rate limit exceeded.
  - `500 Internal Server Error` — caught by `unhandled_exception_handler` in `backend/app/main.py`, logging the error server-side and returning only `{"detail": "An internal error occurred.", "correlation_id": "..."}` so internal stack traces/SQL never leak.

---

## 5. Honest Current Limitation & How We Would Improve It
*(Judges always ask for one real limitation — give a crisp, honest engineering answer!)*

- **Limitation:**
  1. Currently, **Artisan Card & GI verification requires a human Admin officer** in `/admin` to make the final `Verify & Push Live` click (our AI document pre-screener assists with signal extraction, but there is no live government GI Registry / DigiLocker API webhook because the Government of India GI Registry does not yet expose a public real-time REST API).
  2. Additionally, **Razorpay Standard Checkout** collects INR into the platform merchant account rather than automated T+1 escrow split-settlements (`Razorpay Route`), which requires live NBFC/Route KYC onboarding in production.
- **How We Would Improve It Next:**
  1. Integrate **API Setu / DigiLocker Artisan Pehchan verification** + OCR similarity cross-matching against scraped official GI Authorized User PDF bulletins to auto-fast-track clean renewals.
  2. Upgrade payment settlement from Standard Checkout to **Razorpay Route linked artisan accounts** triggered automatically upon buyer doorstep QR CraftProof scan confirmation, and move background malware/AI tasks onto **Redis + Celery** workers for horizontal scaling.

---

## 6. Quick File Map for Individual Team Member Code Walk-Throughs

| Area | Open These Files Live for Judges |
|---|---|
| **Auth, Roles & Artisan Card Gate** | `backend/app/core/auth.py`, `backend/app/modules/auth/router.py`, `app/src/components/ClerkBoundary.jsx`, `app/src/pages/AuthPage.jsx` |
| **Storefront, Seller Studio & Admin Console** | `backend/app/modules/storefront/router.py`, `app/src/pages/portal/AdminPage.jsx`, `app/src/pages/portal/SellerPage.jsx` |
| **ASIGS 10-Layer Guardrails & File Security** | `backend/app/modules/guardrails/service.py`, `backend/app/modules/guardrails/rules/`, `backend/app/core/security.py` |
| **CraftProof Passports, AI Copilot & Demand Bridge** | `backend/app/modules/craftproof/service.py`, `backend/app/modules/ai/service.py`, `backend/app/modules/demand_bridge/matcher.py` |
| **Razorpay Payments & MySQL 8 Schema** | `backend/app/modules/payments/service.py`, `backend/app/integrations/razorpay/signatures.py`, `hunarlink-database/sql/` |
| **HunarSathi Streaming Chatbot** | `hunarsathi-chatbot/server.py`, `hunarsathi-chatbot/chatbot.py`, `hunarsathi-chatbot/widget.js` |
