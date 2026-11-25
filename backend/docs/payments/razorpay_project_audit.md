# HunarLink Razorpay Project Audit (`Phase 0` Baseline & Remediation Record)

## 1. Pre-Implementation Repository Findings (Observed Before Backend Creation)
| Area | Observed File | Finding | Remediation Applied |
|---|---|---|---|
| Frontend Cart Totals | `app/src/utils/legacy.js` | `cartTotals()` computed totals purely in browser JS (`VALLEY10`, `FIRSTCRAFT`, zero tax/shipping). | Backend `create-order` ignores client amounts and recalculates authoritative totals from MySQL line items using `Decimal` -> integer paise. |
| Checkout Modal | `app/src/components/modals/CheckoutModal.jsx` | Marked orders `'Paid (Escrow Protected)'` directly in browser state with inaccurate escrow / direct payout claims. | Updated copy and added `app/src/services/razorpayCheckout.js` using honest **Razorpay Standard Checkout** messaging and server-side create-order + verify integration (with explicit demo-only fallback when backend URL is unset). |
| Payment Credentials | `app/src/pages/ProfilePage.jsx` | Stored only display UPI preference; zero card numbers, CVV, or UPI PIN fields. | Preserved zero PCI sensitive storage; Checkout collects payment details solely inside Razorpay's hosted modal. |
| Wholesale Checkout | `app/src/pages/WholesalePage.jsx` | Had RFQ/estimator UI without online payment API wiring. | Implemented full server-side wholesale `create-order` supporting both `DIRECT_WHOLESALE_LISTING` and non-expired `ACCEPTED_RFQ_QUOTE` orders. |
| Backend & DB | None existed initially | Static React SPA only; no FastAPI service or MySQL schema. | Created standalone `hunarlink-database/` (95 MySQL 8.4 LTS tables) and `backend/` (FastAPI + SQLAlchemy 2.x + Alembic + official `razorpay==1.4.2` SDK). |

## 2. Explicit Scope Boundaries
- **In Scope:** India (`INR`) Retail & Wholesale online payments via Razorpay **Standard Checkout**, server-side signature verification, raw-body webhooks, permissioned full/partial refunds, Admin payment inspection APIs.
- **Explicitly Separated:** Cash-on-Delivery (`COD`) orders and Supplier-to-Dealer procurement Purchase Orders (`SUPPLIER_PROCUREMENT`) are rejected from customer Razorpay Checkout and tracked in distinct tables/flows.
- **Not Claimed:** Standard Checkout is **not** an escrow vault and **not** Razorpay Route split-settlement.
