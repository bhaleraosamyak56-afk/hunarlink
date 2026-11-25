# HunarLink Razorpay Webhook Engineering Guide

## 1. Endpoint & Required Headers
- **Endpoint:** `POST /api/v1/webhooks/razorpay`
- **Authentication:** No Clerk JWT (server-to-server from Razorpay). Protected exclusively by cryptographic signature verification over the **exact raw request body bytes**.
- **Headers:**
  - `X-Razorpay-Signature`: Lowercase hex HMAC-SHA256 computed by Razorpay using the webhook secret configured in the Razorpay Dashboard.
  - `x-razorpay-event-id`: Unique delivery ID per Razorpay event used for database idempotency (`uq_pwe_provider_event_id`).

## 2. Separate Secrets Rule
- **NEVER** reuse `RAZORPAY_KEY_SECRET` as `RAZORPAY_WEBHOOK_SECRET`.
- Configure a dedicated random secret in the Razorpay Dashboard Webhooks panel and store it in `RAZORPAY_WEBHOOK_SECRET`.

## 3. Subscribed Events
| Event | HunarLink Action |
|---|---|
| `payment.captured` | Verifies amount & INR currency; transitions payment to `CAPTURED` and order fulfilment to `CONFIRMED`. |
| `order.paid` | Same authoritative capture reconciliation as `payment.captured`. |
| `payment.failed` | Transitions unpaid payment to `FAILED`; if payment is already `CAPTURED`/`PARTIALLY_REFUNDED`/`REFUNDED`, records `IGNORED_OUT_OF_ORDER`. |
| `refund.created` / `refund.processed` | Reconciles refund record and updates payment status to `PARTIALLY_REFUNDED` or `REFUNDED`. |

## 4. Reverse Proxy Requirements (Nginx / WAF)
- Pass request body bytes **unmodified** to FastAPI (never re-serialize JSON in a proxy).
- Allow `POST /api/v1/webhooks/razorpay` through CDN/WAF without blocking Razorpay webhook servers, while keeping strict body size caps (`client_max_body_size 1m`) and rate limiting.
