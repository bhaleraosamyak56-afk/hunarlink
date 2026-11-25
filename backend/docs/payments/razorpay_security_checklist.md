# HunarLink Razorpay Security Checklist

- [x] **Zero Secrets in Frontend or Git:** `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are strictly backend-only (`SecretStr`); `VITE_*` exposes only optional API base URL, never secrets.
- [x] **Zero PCI Credential Storage:** Neither React nor FastAPI nor MySQL ever accepts, logs, or stores card numbers, CVV, expiry, UPI PINs, or net-banking passwords.
- [x] **Server-Side Amount Authority:** `create-order` ignores browser-sent totals and recalculates exact `Decimal` INR totals from MySQL line items before converting to integer paise.
- [x] **Constant-Time Signature Verification:** Both Checkout callback and Webhook HMAC SHA-256 verification use `hmac.compare_digest`.
- [x] **DB-Stored Order Binding:** Checkout `verify` hashes the DB-stored `provider_order_id` (rejecting tampered browser order IDs) and cross-checks fetched Razorpay `amount`, `currency`, and `status`.
- [x] **Separate Webhook Secret + Raw Body:** Webhooks verify exact raw request bytes against `RAZORPAY_WEBHOOK_SECRET` (distinct from `RAZORPAY_KEY_SECRET`).
- [x] **Idempotency & Replay Defense:** Enforced on `create-order`, `verify`, `webhooks/razorpay` (`x-razorpay-event-id`), and `refunds`.
- [x] **Out-of-Order Protection:** Delayed `payment.failed` events cannot downgrade `CAPTURED`, `PARTIALLY_REFUNDED`, or `REFUNDED` payments.
- [x] **Fulfilment Gate:** Orders advance to `CONFIRMED` only on verified `CAPTURED` (never `AUTHORIZED` alone).
- [x] **Short DB Transactions:** Pending payment/refund rows commit before calling external Razorpay HTTP endpoints; timeouts transition to `RECONCILIATION_REQUIRED`.
- [x] **RBAC & Immutable Audit:** Refunds require Admin `payments.refund` permission and mandatory `reason`, enforced by both FastAPI and MySQL refund-cap / append-only audit triggers.
- [x] **Rate Limiting & Log Redaction:** Payment endpoints enforce sliding-window rate limits, and `redact_sensitive()` masks secrets/tokens/cards in logs.
