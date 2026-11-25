# HunarLink Razorpay Architecture

## 1. Trust Boundaries & Authority
1. **Browser (Untrusted):** Opens Razorpay Checkout using only public fields (`razorpay_key_id`, `razorpay_order_id`, `amount_paise`, `currency`). Any browser-supplied amount or order status is untrusted.
2. **FastAPI Backend (Authoritative):**
   - Verifies Clerk RS256 session JWT and MySQL account/role status.
   - Recalculates order totals in `Decimal` rupees from `retail_order_items` / `wholesale_order_items` and converts to exact integer paise (`rupees_to_paise`).
   - Validates seller/dealer active & approved status, active listings, and non-expired accepted RFQ quotes.
   - Commits `INITIATED` intent in a short MySQL transaction **before** calling Razorpay APIs (preventing connection-pool exhaustion during external network I/O).
   - Verifies Checkout callbacks via constant-time HMAC SHA-256 against the **DB-stored `provider_order_id`** and `RAZORPAY_KEY_SECRET`, then cross-checks fetched payment `status`, `amount`, and `currency`.
   - Verifies webhooks over **exact raw request bytes** using the separate `RAZORPAY_WEBHOOK_SECRET` and deduplicates on `x-razorpay-event-id`.

## 2. Distinct Commercial Entities (Never Conflated)
| Entity | Table(s) | Purpose |
|---|---|---|
| Customer Retail Order | `retail_orders`, `seller_fulfilment_groups`, `retail_order_items` | Retail cart checkout & fulfilment lifecycle |
| Wholesale Order | `wholesale_orders`, `wholesale_order_items` | Bulk B2B orders (direct wholesale listing or accepted RFQ quote) |
| Online Payment & Attempts | `payments`, `payment_attempts`, `payment_status_history` | Razorpay order/payment lifecycle & reconciliation |
| Webhook Inbox | `payment_webhook_events` | Signed idempotent delivery log from Razorpay |
| Refunds | `refunds` | Full & partial refunds capped at `captured_amount` |
| Cash on Delivery | `cod_collections` (`payment_method='COD'`) | Offline courier cash collection (never creates Razorpay orders) |
| Supplier Procurement | `supplier_purchase_orders`, `procurement_payment_obligations` | B2B dealer-to-supplier obligations (blocked from customer checkout) |
| Seller/Dealer Settlements | `seller_payout_ledgers`, `payout_batches` | Post-capture internal accounting (distinct from Razorpay Standard Checkout capture) |

## 3. State Machine Separation
- **Payment Status:** `INITIATED -> ORDER_CREATED -> AUTHORIZED -> CAPTURED -> PARTIALLY_REFUNDED -> REFUNDED` (plus `FAILED`, `RECONCILIATION_REQUIRED`, `CANCELLED`).
- **Fulfilment Status:** `PENDING_PAYMENT -> CONFIRMED -> ...`. Fulfilment advances to `CONFIRMED` **only** when payment reaches verified `CAPTURED` (never on `AUTHORIZED` alone).
- **Monotonic Protection:** Once `CAPTURED`, `PARTIALLY_REFUNDED`, or `REFUNDED`, an out-of-order delayed `payment.failed` webhook is recorded as `IGNORED_OUT_OF_ORDER` and never downgrades the payment.
