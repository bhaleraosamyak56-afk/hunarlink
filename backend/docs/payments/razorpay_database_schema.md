# HunarLink Razorpay Database Schema Reference (MySQL 8.4 LTS)

All Razorpay payment records reuse the existing Module G tables defined in `hunarlink-database/sql/07_payments_refunds_ledger.sql` — zero duplicate tables were created.

## 1. Tables Used by Razorpay Integration
| Table | Key Columns & Constraints | Role |
|---|---|---|
| `payments` | `id CHAR(36) ascii_bin`, `payment_reference UNIQUE`, `payment_purpose` (`RETAIL_ORDER`/`WHOLESALE_ORDER`), `retail_order_id`, `wholesale_order_id`, `amount DECIMAL(14,2)`, `captured_amount DECIMAL(14,2)`, `currency_code CHAR(3)`, `idempotency_key UNIQUE`, `provider_order_id UNIQUE`, `provider_payment_id UNIQUE` | Authoritative HunarLink payment ledger row |
| `payment_attempts` | `payment_id FK`, `attempt_number`, `idempotency_key UNIQUE`, `provider_order_id UNIQUE`, `attempt_status` (`INITIATED`/`ORDER_CREATED`/`AUTHORIZED`/`CAPTURED`/`FAILED`/`RECONCILIATION_REQUIRED`) | Tracks retries, timeouts, and gateway errors cleanly |
| `payment_status_history` | `payment_id FK`, `from_status`, `to_status`, `event_source` (`API`/`VERIFY_CALLBACK`/`WEBHOOK`/`ADMIN_REFUND`), `actor_user_id`, `provider_event_ref` | Append-only state transition timeline |
| `payment_webhook_events` | `UNIQUE(provider_name, provider_event_id)`, `signature_verified TINYINT(1)`, `processing_status`, `safe_payload_summary_json` | Idempotent raw-body webhook inbox (no raw card/PII storage) |
| `refunds` | `refund_reference UNIQUE`, `payment_id FK`, `provider_refund_id UNIQUE`, `idempotency_key UNIQUE`, `amount DECIMAL(14,2)`, `refund_type` (`FULL`/`PARTIAL`), `reason`, plus MySQL triggers `trg_refunds_before_insert_cap` & `trg_refunds_before_update_cap` | Enforces both application-level AND database-trigger refund caps |
| `audit_logs` | Immutable via `trg_audit_logs_no_update` and `trg_audit_logs_no_delete` | Captures every Admin refund and sensitive reconciliation override |

## 2. Money & Time Standards
- **Money:** Strictly `DECIMAL(14,2)` in MySQL and `decimal.Decimal` in Python -> converted to exact integer paise (`int`) only at the Razorpay API boundary. Zero `FLOAT` / `DOUBLE`.
- **Timestamps:** UTC `DATETIME(6)` across all tables.
- **UUIDs:** `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin`.
