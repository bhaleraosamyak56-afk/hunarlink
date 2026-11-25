# HunarLink Razorpay Go-Live Checklist (Pre-Production Gate)

**Current Status:** Automated Tier 1 mocked tests (`30/30`) pass. **NOT yet production-live** until every staging and live-mode gate below is verified by the operator.

## 1. Database & Migration Verification (Live MySQL 8.4 LTS)
- [ ] Run `hunarlink-database/hunarlink_mysql_full_install.sql` on staging and production MySQL 8.4 LTS servers.
- [ ] Run `hunarlink-database/sql/11_validation_queries.sql` and confirm 95 baseline tables, 6 triggers, 6 views, 4 procedures.
- [ ] Stamp and upgrade Alembic (`alembic stamp 0001_hunarlink_mysql_baseline && alembic upgrade head`) to create the 6 ASIGS guardrail tables (101 total tables).
- [ ] Verify least-privilege MySQL app account (no `DROP`/`ALTER`/`SUPER` privileges in runtime app role).

## 2. Razorpay Account, KYC & Secrets
- [ ] Complete Razorpay KYC & live merchant activation for HunarLink's legal Indian business entity.
- [ ] Store separate **Live Mode** `RAZORPAY_KEY_ID` (`rzp_live_*`), `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in the server secret manager (never in `.env` committed to Git).
- [ ] Configure `APP_ENV=production` (disables `/docs` and `/redoc`) and exact HTTPS production `CORS_ALLOW_ORIGINS`.

## 3. Infrastructure & Webhook Readiness
- [ ] Enforce HTTPS / TLS 1.2+ with HSTS on the API reverse proxy (`security/nginx/hunarlink-api.conf.example`).
- [ ] Register `https://<prod-api-domain>/api/v1/webhooks/razorpay` in Razorpay Live Dashboard and confirm HTTP 200 delivery.
- [ ] Verify Redis-backed rate limiting if running multiple Uvicorn/Gunicorn workers.

## 4. Final Live Penny-Test & Monitoring
- [ ] Perform a real ₹1–₹10 live checkout on a test SKU, verify `CAPTURED` + `CONFIRMED` + webhook reconciliation.
- [ ] Execute an Admin full refund on that penny-test payment and verify settlement + `audit_logs` entry.
- [ ] Enable alerts for `RECONCILIATION_REQUIRED` payments, `5xx` spikes, and webhook signature failures.
