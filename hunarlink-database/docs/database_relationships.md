# HunarLink MySQL 8.4 LTS — Database Relationships & `ON DELETE` Policy

## 1. Deliberate `ON DELETE` Rules
HunarLink preserves historical financial, procurement, compliance, and order data:
- **`ON DELETE RESTRICT`** (default on financial, order, procurement, verification, inventory, and user references): prevents accidental cascade deletion of orders, payments, refunds, purchase orders, receipts, or verified sellers.
- **`ON DELETE SET NULL`**: used only on optional metadata references (e.g., `reviewed_by_user_id`, `brand_id`, `shipping_address_id` where an immutable JSON snapshot already exists on the order).
- **`ON DELETE CASCADE`**: used **only** for dependent ephemeral/mapping child rows that carry no independent accounting history (`cart_items`, `wishlist_items`, `wholesale_cart_items`, `wholesale_price_tiers`, `wholesale_rfq_items`, `dealer_quote_items`, `product_images`, `dealer_categories`, `admin_role_permissions`, `promotion_products`, `promotion_categories`, `notifications`, `support_ticket_messages`).

## 2. Key Business Workflow Chains

### A. Multi-Role Identity & Admin RBAC
- `users (1) ─── (*) user_role_assignments (*) ─── (1) platform_roles`
- One person can simultaneously hold `CUSTOMER`, `DIRECT_SELLER`, and `SUPPLIER` roles.
- Admin access requires an active `admin_profiles` row + active `admin_user_roles` → `admin_roles` → `admin_role_permissions` → `admin_permissions`.

### B. GI vs. Non-GI Seller & Product Verification
- **Non-GI Seller:** `seller_profiles` → `seller_verification_applications (verification_path = 'NON_GI')` → `seller_documents` → manual Admin review → `seller_verification_history`. Trigger `trg_gi_runs_block_non_gi` forbids creating `gi_verification_runs` rows for Non-GI apps.
- **GI Seller:** `seller_verification_applications (verification_path = 'GI')` → optional `gi_verification_runs` (compared against `gi_reference_records`, `is_legal_proof = 0`) → mandatory Admin human review.
- **Product GI Claim (Independent):** `products` → `product_gi_claims` → `gi_claim_documents` → `gi_verification_runs` → Admin updates `products.gi_status`. Approving a GI seller never automatically approves `products.gi_status`.

### C. Supplier-to-Dealer Procurement → Dealer Inventory
1. `supplier_profiles` → `supplier_lots` (offered quantity only; NOT a product listing or inventory).
2. Admin ranks dealers in `dealer_assignment_recommendations` and invites a dealer via `dealer_assignments` (invitation only; no ownership transfer).
3. Accept/decline attempts are preserved in `dealer_assignments` + `dealer_assignment_history`.
4. After acceptance & agreed terms → `supplier_purchase_orders` + `supplier_purchase_order_items`.
5. Physical receipt at dealer warehouse → `goods_receipts` + `goods_receipt_items` → `quality_inspections`.
6. Calling `sp_post_goods_receipt_to_dealer_stock` verifies a passing `quality_inspections` record and posts `accepted_quantity` into dealer `warehouse_stock` **exactly once** (protected by unique `inventory_transactions.goods_receipt_post_guard`).

### D. Retail Multi-Seller Checkout & Inventory Safety
- `carts` + `cart_items` → `retail_orders` (1 customer order) → `seller_fulfilment_groups` (1 per direct seller in the cart) → `retail_order_items` (immutable snapshots).
- `sp_reserve_warehouse_stock` uses `SELECT ... FOR UPDATE` inside the caller's InnoDB transaction to lock `warehouse_stock`, prevent negative balances, create `stock_reservations`, and append to `inventory_transactions`.

### E. Wholesale Marketplace (Direct Bulk & RFQ → Quote → Order)
- `dealer_wholesale_listings` + `wholesale_price_tiers` support MOQ and bulk tier pricing.
- RFQ path: `wholesale_rfqs` + `wholesale_rfq_items` → `rfq_dealer_invitations` → `dealer_quotes` + `dealer_quote_items` → `wholesale_orders` (single dealer in v1).
- Trigger `trg_wholesale_orders_validate_quote` guarantees an accepted quote belongs to the exact buyer's RFQ and selected dealer before `wholesale_orders` can be inserted.

### F. Payments, Webhooks, Refunds & Settlements
- `payments` connects strictly to **one** target (`retail_order_id`, `wholesale_order_id`, or `supplier_purchase_order_id`, enforced by `chk_payments_single_target`).
- `payment_attempts` supports retries with unique `idempotency_key`.
- `payment_webhook_events` stores signed Razorpay events with unique `(provider_name, provider_event_id)`.
- `refunds` enforces cumulative refunds ≤ `payments.captured_amount` via `trg_refunds_before_insert_cap` and `trg_refunds_before_update_cap`.
- `payouts` tracks seller/dealer/supplier settlement obligations separately from Razorpay Standard Checkout.
