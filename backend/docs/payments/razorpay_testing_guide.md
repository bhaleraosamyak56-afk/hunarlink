# HunarLink Razorpay Testing Guide (Mocked vs Test Mode vs Live Mode)

## 1. Clear Distinction Between Testing Tiers
| Tier | Credentials | Gateway | What It Proves |
|---|---|---|---|
| **Tier 1 — Automated Mocked Suite (`pytest`)** | Synthetic test strings in `conftest.py` | `FakeRazorpayGateway` | Server-side calculation, HMAC SHA-256 math, raw-body webhooks, idempotency, out-of-order safety, RBAC, refund caps, timeout handling (30 tests). |
| **Tier 2 — Razorpay Test Mode (Staging)** | `rzp_test_*` keys + Staging Webhook Secret | Real Razorpay Sandbox API + Modal | Live HTTPS checkout popup, test UPI (`success@razorpay`), test cards, real webhook delivery over HTTPS tunnel/staging domain, MySQL 8.4 trigger enforcement. |
| **Tier 3 — Razorpay Live Mode (Production)** | `rzp_live_*` keys + Production Webhook Secret | Live Razorpay Production | Real INR ₹1–₹10 penny-test capture + full refund verification before public launch. |

> **Never equate Tier 1 mocked tests with Tier 2 Test Mode or Tier 3 Live Mode readiness.**

## 2. Running Tier 1 Automated Tests (30 Razorpay Tests + 21 ASIGS Tests)
```bash
cd backend
pytest -v tests/test_razorpay_payments.py
```
Expected result: `30 passed`.

## 3. Tier 2 Razorpay Test Mode Manual Smoke Plan (Run Once Staging MySQL + HTTPS Are Provisioned)
1. Configure `RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_KEY_SECRET=...`, and `RAZORPAY_WEBHOOK_SECRET=...` in staging secrets manager (never commit `.env`).
2. Register `https://<staging-api-domain>/api/v1/webhooks/razorpay` in Razorpay Dashboard (Test Mode) for `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
3. Execute a retail test checkout using Razorpay Test UPI (`success@razorpay`) and confirm:
   - Order transitions to `payment_status='CAPTURED'` and `fulfilment_status='CONFIRMED'`.
   - Webhook row appears in `payment_webhook_events` with `signature_verified=1`.
4. Trigger a partial refund and then completing refund from Admin API; verify `audit_logs` and Razorpay Dashboard match to the exact paise.
