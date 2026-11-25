# HunarLink Razorpay Payment Flows (Mermaid Diagrams)

## 1. Retail & Wholesale Standard Checkout Flow
```mermaid
sequenceDiagram
    autonumber
    participant Browser as React Storefront
    participant API as FastAPI Backend
    participant DB as MySQL 8.4 LTS
    participant RZP as Razorpay API & Modal

    Browser->>API: POST /api/v1/payments/razorpay/create-order (Clerk JWT, order_id, idempotency_key)
    API->>DB: Verify owner, active seller/dealer, non-expired quote, recalculate Decimal total
    API->>DB: Short TX #1: INSERT payment (INITIATED) + payment_attempt -> COMMIT
    API->>RZP: orders.create(amount_paise, currency="INR", receipt)
    alt Timeout
        API->>DB: Mark RECONCILIATION_REQUIRED (no blind duplicate)
        API-->>Browser: 504 Gateway Timeout
    else Order Created
        API->>DB: Short TX #2: Save provider_order_id, status=ORDER_CREATED -> COMMIT
        API-->>Browser: 200 OK (razorpay_key_id, razorpay_order_id, amount_paise)
    end
    Browser->>RZP: Open Checkout modal with server order_id
    RZP-->>Browser: Handler callback (payment_id, order_id, signature)
    Browser->>API: POST /api/v1/payments/razorpay/verify
    API->>DB: Load payment & DB-stored provider_order_id
    API->>API: Verify HMAC-SHA256(stored_order_id|payment_id, RAZORPAY_KEY_SECRET)
    API->>RZP: payments.fetch(payment_id) -> verify amount, currency & status
    alt status == captured
        API->>DB: Payment=CAPTURED, Order fulfilment=CONFIRMED
    else status == authorized
        API->>DB: Payment=AUTHORIZED, Order fulfilment stays PENDING_PAYMENT
    end
    API-->>Browser: 200 OK (authoritative payment_status & fulfilment_status)
```

## 2. Server-to-Server Webhook Flow (Source of Truth for Async Events)
```mermaid
sequenceDiagram
    autonumber
    participant RZP as Razorpay Webhook
    participant API as FastAPI /api/v1/webhooks/razorpay
    participant DB as MySQL 8.4 LTS

    RZP->>API: POST raw JSON + X-Razorpay-Signature + x-razorpay-event-id
    API->>API: Verify HMAC-SHA256(raw_bytes, RAZORPAY_WEBHOOK_SECRET)
    API->>DB: Check payment_webhook_events(provider_event_id)
    alt Already Seen
        API-->>RZP: 200 OK (DUPLICATE_IGNORED)
    else New Event
        API->>DB: Persist webhook row + apply monotonic state transition
        Note over API,DB: Delayed payment.failed after CAPTURED -> IGNORED_OUT_OF_ORDER
        API-->>RZP: 200 OK (PROCESSED / IGNORED_OUT_OF_ORDER)
    end
```

## 3. Admin Permissioned Refund Flow
```mermaid
sequenceDiagram
    autonumber
    participant Admin as Admin Portal
    participant API as FastAPI /api/v1/payments/{id}/refund
    participant DB as MySQL 8.4 LTS
    participant RZP as Razorpay Refund API

    Admin->>API: POST refund (Clerk JWT + payments.refund, FULL/PARTIAL, reason, idempotency_key)
    API->>DB: Check idempotency_key & remaining refundable cap (captured - refunded)
    API->>DB: Short TX #1: INSERT refund (INITIATED) -> COMMIT
    API->>RZP: payment.refund(provider_payment_id, amount_paise)
    API->>DB: Short TX #2: Update refund, payment (PARTIALLY_REFUNDED/REFUNDED) + INSERT audit_logs -> COMMIT
    API-->>Admin: 200 OK (RefundResponse)
```
