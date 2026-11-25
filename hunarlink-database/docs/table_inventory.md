# HunarLink MySQL 8.4 LTS — Table Inventory (95 Baseline Business Tables)

Reconciled automatically by `tools/validate_sql_static.py`: **95 / 95 base tables**, **255 foreign keys**, **134 CHECK constraints**, **9 generated partial-uniqueness columns**.

> Note on modular file placement: `product_gi_claims`, `gi_claim_documents`, and `gi_verification_runs` are placed in `sql/03_catalog_and_gi_products.sql` right after `products`, and `dealer_wholesale_listings` is placed in `sql/06_wholesale_marketplace.sql` right after `dealer_profiles`, `warehouses`, and `warehouse_stock`. This guarantees zero forward-reference foreign-key errors under strict `FOREIGN_KEY_CHECKS = 1`.

| # | Business Module | SQL Script | Table Name | Key Integrity Rules |
|---:|---|---|---|---|
| 1 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `users` | Unique `clerk_user_id` & `email`; no passwords |
| 2 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `platform_roles` | Seeded 6 platform roles |
| 3 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `user_role_assignments` | Multi-role per user; generated `active_role_guard` prevents duplicate ACTIVE roles |
| 4 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `user_addresses` | Generated `default_address_guard` enforces max 1 active default per user |
| 5 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `admin_profiles` | Never seeded with fake admin |
| 6 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `admin_roles` | Seeded 6 admin roles |
| 7 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `admin_permissions` | Seeded 16 fine-grained permissions |
| 8 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `admin_user_roles` | Generated `active_assignment_guard` prevents duplicate active role assignments |
| 9 | A. Identity & Admin | `01_identity_and_admin_access.sql` | `admin_role_permissions` | Unique `(admin_role_id, admin_permission_id)` |
| 10 | B. Seller & GI | `02_sellers_and_verification.sql` | `seller_profiles` | Separate `verification_path`, `profile_status`, `verification_status` |
| 11 | B. Seller & GI | `02_sellers_and_verification.sql` | `seller_verification_applications` | `ENUM('GI','NON_GI')` path isolation |
| 12 | B. Seller & GI | `02_sellers_and_verification.sql` | `seller_documents` | Private `storage_key`, SHA-256 hash, `scan_status` |
| 13 | B. Seller & GI | `02_sellers_and_verification.sql` | `seller_verification_history` | Status transition trail with `correlation_id` |
| 14 | B. Seller & GI | `02_sellers_and_verification.sql` | `gi_reference_records` | Versioned official GI reference records (0 fictional seeds) |
| 15 | C. Product Catalogue | `03_catalog_and_gi_products.sql` | `categories` | Hierarchical `parent_id`, GI-eligibility flag |
| 16 | C. Product Catalogue | `03_catalog_and_gi_products.sql` | `brands` | Shared catalogue brands |
| 17 | C. Product Catalogue | `03_catalog_and_gi_products.sql` | `products` | Separate `gi_status` & `approval_status`; FULLTEXT indexed |
| 18 | C. Product Catalogue | `03_catalog_and_gi_products.sql` | `product_variants` | `DECIMAL(14,2)` MRP + `currency_code` |
| 19 | C. Product Catalogue | `03_catalog_and_gi_products.sql` | `product_images` | Generated `primary_image_guard` enforces single primary image |
| 20 | B. Seller & GI | `03_catalog_and_gi_products.sql` | `product_gi_claims` | Per-product GI claim separate from seller status |
| 21 | B. Seller & GI | `03_catalog_and_gi_products.sql` | `gi_claim_documents` | Private `storage_key` + SHA-256 + `scan_status` |
| 22 | B. Seller & GI | `03_catalog_and_gi_products.sql` | `gi_verification_runs` | `CHECK (is_legal_proof = 0)`; Non-GI blocked by trigger |
| 23 | C. Product Catalogue | `03_catalog_and_gi_products.sql` | `seller_product_listings` | Retail seller offer with price/MRP/qty checks |
| 24 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_profiles` | Supplier/producer profile |
| 25 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_verification_applications` | Supplier onboarding workflow |
| 26 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_documents` | Private keys & scan status |
| 27 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_verification_history` | Supplier verification audit history |
| 28 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_lots` | Offered supply quantity (not catalogue) |
| 29 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_lot_documents` | Supporting lot evidence |
| 30 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_lot_status_history` | Lot lifecycle trail |
| 31 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `dealer_profiles` | Approved dealer profile & capacity |
| 32 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `dealer_documents` | Dealer KYC & warehouse proof |
| 33 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `dealer_categories` | Approved categories per dealer |
| 34 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `warehouses` | Seller, Dealer, or Platform warehouse (`CHECK` enforces single owner) |
| 35 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `dealer_assignment_recommendations` | Ranked match scores per lot |
| 36 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `dealer_assignments` | Invitation only; generated guard allows re-attempts after decline |
| 37 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `dealer_assignment_history` | Accept/decline history |
| 38 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_purchase_orders` | Created only after agreement; separate from customer orders |
| 39 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_purchase_order_status_history` | PO status trail |
| 40 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `supplier_purchase_order_items` | PO line-item cost snapshots |
| 41 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `goods_receipts` | Warehouse receiving record |
| 42 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `goods_receipt_items` | Accepted + rejected + damaged ≤ received CHECK |
| 43 | D. Procurement | `04_suppliers_dealers_and_procurement.sql` | `quality_inspections` | Required pass check before dealer stock posting |
| 44 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `warehouse_stock` | Non-negative available/reserved/damaged + optimistic `version` |
| 45 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `inventory_transactions` | Immutable stock ledger; `goods_receipt_post_guard` ensures 1x dealer posting |
| 46 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `carts` | Generated `active_cart_guard` (max 1 active retail cart per user) |
| 47 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `cart_items` | Unique `(cart_id, seller_listing_id)` |
| 48 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `wishlists` | Generated `default_wishlist_guard` |
| 49 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `wishlist_items` | Unique `(wishlist_id, product_id)` |
| 50 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `retail_orders` | Separate `payment_status` and `fulfilment_status` |
| 51 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `seller_fulfilment_groups` | Splits multi-seller retail checkout cleanly per seller |
| 52 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `retail_order_items` | Immutable product/SKU/price/tax/GI snapshots |
| 53 | E. Inventory & Retail | `05_inventory_and_retail.sql` | `retail_order_status_history` | Retail order & fulfilment history |
| 54 | C. Product Catalogue | `06_wholesale_marketplace.sql` | `dealer_wholesale_listings` | Bulk dealer offer with MOQ & lead time |
| 55 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_buyer_profiles` | Verified B2B buyer profile |
| 56 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_price_tiers` | Quantity-based tier pricing |
| 57 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_carts` | Generated `active_cart_guard` per wholesale buyer |
| 58 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_cart_items` | Wholesale cart lines |
| 59 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_rfqs` | Buyer Request for Quotation |
| 60 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_rfq_items` | RFQ line specifications |
| 61 | F. Wholesale | `06_wholesale_marketplace.sql` | `rfq_dealer_invitations` | Dealers invited to quote an RFQ |
| 62 | F. Wholesale | `06_wholesale_marketplace.sql` | `dealer_quotes` | Dealer quotations with expiry (`valid_until`) |
| 63 | F. Wholesale | `06_wholesale_marketplace.sql` | `dealer_quote_items` | Quoted line items |
| 64 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_orders` | Single-dealer v1 order; quote match enforced by trigger |
| 65 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_order_items` | Immutable bulk line snapshots |
| 66 | F. Wholesale | `06_wholesale_marketplace.sql` | `wholesale_order_status_history` | Wholesale order status history |
| 67 | F. Wholesale | `06_wholesale_marketplace.sql` | `stock_reservations` | Checkout inventory holds (`ACTIVE`/`RELEASED`/`CONSUMED`/`EXPIRED`) |
| 68 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `payments` | Separate `RETAIL_ORDER`/`WHOLESALE_ORDER`/`SUPPLIER_PROCUREMENT` |
| 69 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `payment_attempts` | Multi-attempt support + unique `idempotency_key` |
| 70 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `payment_status_history` | Payment transition audit |
| 71 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `payment_webhook_events` | Durable webhook inbox (`UNIQUE (provider_name, provider_event_id)`) |
| 72 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `refunds` | Full/partial refunds capped ≤ captured amount via triggers |
| 73 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `payouts` | Seller/dealer/supplier settlement obligations (separate from Checkout) |
| 74 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `shipments` | Retail, wholesale, or procurement shipments |
| 75 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `shipment_items` | Shipped item quantities |
| 76 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `tracking_events` | Carrier tracking timeline |
| 77 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `return_requests` | Return workflow header |
| 78 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `return_status_history` | Return transition history |
| 79 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `return_items` | Returned line items & restock flag |
| 80 | G. Payments & Ops | `07_payments_shipping_returns_reviews.sql` | `product_reviews` | Verified purchase ratings (1–5 CHECK) |
| 81 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `coupons` | Server-validated discount codes |
| 82 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `coupon_usage` | Redemption tracking |
| 83 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `promotions` | Time-bounded promotional campaigns |
| 84 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `promotion_products` | Promotion ↔ product join |
| 85 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `promotion_categories` | Promotion ↔ category join |
| 86 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `notifications` | User in-app/email/SMS notifications |
| 87 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `support_tickets` | Customer/seller/dealer support cases |
| 88 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `support_ticket_messages` | Ticket conversation & internal Admin notes |
| 89 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `audit_logs` | Immutable append-only audit log (triggers block UPDATE/DELETE) |
| 90 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `admin_action_requests` | Dual-control approval (`CHECK reviewer <> requester`) |
| 91 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `platform_settings` | Non-secret operational configuration flags |
| 92 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `announcements` | Role-scoped platform announcements |
| 93 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `product_approval_history` | Product & listing approval trail |
| 94 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `dealer_status_history` | Dealer status audit trail |
| 95 | H. Platform Ops | `08_promotions_notifications_and_admin_operations.sql` | `supplier_status_history` | Supplier status audit trail |

> **Alembic Extension (6 ASIGS Guardrail Tables):** Added cleanly in `backend/alembic/versions/0002_add_asigs_guardrail_tables.py` (`guardrail_rules`, `guardrail_checks`, `guardrail_cases`, `guardrail_case_events`, `file_security_scans`, `input_fingerprints`) without duplicating any of the 95 baseline tables.
