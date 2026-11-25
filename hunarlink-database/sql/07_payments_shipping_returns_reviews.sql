-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/07_payments_shipping_returns_reviews.sql
-- Module G: Payments, Shipping, Returns & Reviews (13 tables)
-- Tables:
--   68. payments
--   69. payment_attempts
--   70. payment_status_history
--   71. payment_webhook_events
--   72. refunds
--   73. payouts
--   74. shipments
--   75. shipment_items
--   76. tracking_events
--   77. return_requests
--   78. return_status_history
--   79. return_items
--   80. product_reviews
-- Rules:
--   - Payment status is strictly separate from order fulfilment status.
--   - Supports RETAIL_ORDER, WHOLESALE_ORDER, and SUPPLIER_PROCUREMENT separately.
--   - Never store card numbers, CVV, UPI PINs, or gateway secrets.
--   - Cumulative refunds can never exceed captured payment amount.
--   - Webhook inbox guarantees idempotent processing via unique provider_event_id.
-- =============================================================================

USE `hunarlink`;

-- 68. payments
CREATE TABLE IF NOT EXISTS `payments` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payment_reference` VARCHAR(64) NOT NULL,
  `payment_purpose` ENUM('RETAIL_ORDER', 'WHOLESALE_ORDER', 'SUPPLIER_PROCUREMENT') NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `payer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payment_method` ENUM('RAZORPAY_STANDARD', 'COD', 'BANK_TRANSFER_OFFLINE') NOT NULL DEFAULT 'RAZORPAY_STANDARD',
  `provider_name` VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY',
  `amount` DECIMAL(14,2) NOT NULL,
  `captured_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `payment_status` ENUM('CREATED', 'ORDER_CREATED', 'CHECKOUT_OPENED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'RECONCILIATION_REQUIRED', 'COD_PENDING', 'COD_COLLECTED') NOT NULL DEFAULT 'CREATED',
  `idempotency_key` VARCHAR(128) NOT NULL,
  `provider_order_id` VARCHAR(128) NULL,
  `provider_payment_id` VARCHAR(128) NULL,
  `provider_receipt` VARCHAR(80) NULL,
  `authorized_at` DATETIME(6) NULL,
  `captured_at` DATETIME(6) NULL,
  `failed_at` DATETIME(6) NULL,
  `failure_code` VARCHAR(100) NULL,
  `failure_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_reference` (`payment_reference`),
  UNIQUE KEY `uq_payments_idempotency_key` (`idempotency_key`),
  UNIQUE KEY `uq_payments_provider_order_id` (`provider_order_id`),
  UNIQUE KEY `uq_payments_provider_payment_id` (`provider_payment_id`),
  KEY `idx_payments_retail_order` (`retail_order_id`),
  KEY `idx_payments_wholesale_order` (`wholesale_order_id`),
  KEY `idx_payments_supplier_po` (`supplier_purchase_order_id`),
  KEY `idx_payments_payer_status` (`payer_user_id`, `payment_status`),
  KEY `idx_payments_purpose_status` (`payment_purpose`, `payment_status`),
  CONSTRAINT `fk_payments_payer` FOREIGN KEY (`payer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payments_retail_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payments_wholesale_order` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payments_supplier_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_payments_amounts` CHECK (`amount` > 0.00 AND `captured_amount` >= 0.00 AND `captured_amount` <= `amount`),
  CONSTRAINT `chk_payments_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3),
  CONSTRAINT `chk_payments_single_target` CHECK (
    (`payment_purpose` = 'RETAIL_ORDER' AND `retail_order_id` IS NOT NULL AND `wholesale_order_id` IS NULL AND `supplier_purchase_order_id` IS NULL)
    OR (`payment_purpose` = 'WHOLESALE_ORDER' AND `wholesale_order_id` IS NOT NULL AND `retail_order_id` IS NULL AND `supplier_purchase_order_id` IS NULL)
    OR (`payment_purpose` = 'SUPPLIER_PROCUREMENT' AND `supplier_purchase_order_id` IS NOT NULL AND `retail_order_id` IS NULL AND `wholesale_order_id` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 69. payment_attempts
CREATE TABLE IF NOT EXISTS `payment_attempts` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `attempt_number` INT UNSIGNED NOT NULL DEFAULT 1,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `provider_order_id` VARCHAR(128) NULL,
  `provider_payment_id` VARCHAR(128) NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `attempt_status` ENUM('INITIATED', 'ORDER_CREATED', 'CHECKOUT_OPENED', 'PENDING_VERIFICATION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'RECONCILIATION_REQUIRED') NOT NULL DEFAULT 'INITIATED',
  `failure_code` VARCHAR(100) NULL,
  `failure_description` VARCHAR(500) NULL,
  `safe_metadata_json` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pa_idempotency_key` (`idempotency_key`),
  UNIQUE KEY `uq_pa_provider_order_id` (`provider_order_id`),
  KEY `idx_pa_payment_attempt` (`payment_id`, `attempt_number`),
  KEY `idx_pa_payer` (`payer_user_id`),
  KEY `idx_pa_provider_payment` (`provider_payment_id`),
  KEY `idx_pa_status` (`attempt_status`),
  CONSTRAINT `fk_pa_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pa_payer` FOREIGN KEY (`payer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_pa_amount` CHECK (`amount` > 0.00),
  CONSTRAINT `chk_pa_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 70. payment_status_history
CREATE TABLE IF NOT EXISTS `payment_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `event_source` ENUM('CREATE_ORDER', 'VERIFY_CALLBACK', 'WEBHOOK', 'RECONCILIATION', 'REFUND', 'COD_COLLECTION', 'ADMIN') NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `provider_event_ref` VARCHAR(128) NULL,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_psh_payment_created` (`payment_id`, `created_at`),
  KEY `idx_psh_actor` (`actor_user_id`),
  CONSTRAINT `fk_psh_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_psh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 71. payment_webhook_events
-- Durable inbox for signed webhooks; unique provider_event_id guarantees idempotency.
CREATE TABLE IF NOT EXISTS `payment_webhook_events` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider_name` VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY',
  `provider_event_id` VARCHAR(128) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `provider_order_id` VARCHAR(128) NULL,
  `provider_payment_id` VARCHAR(128) NULL,
  `signature_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `processing_status` ENUM('RECEIVED', 'PROCESSED', 'DUPLICATE_IGNORED', 'IGNORED_OUT_OF_ORDER', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
  `safe_payload_summary_json` JSON NULL,
  `error_summary` VARCHAR(500) NULL,
  `received_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `processed_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pwe_provider_event_id` (`provider_name`, `provider_event_id`),
  KEY `idx_pwe_event_type_status` (`event_type`, `processing_status`),
  KEY `idx_pwe_payment` (`payment_id`),
  KEY `idx_pwe_provider_order` (`provider_order_id`),
  KEY `idx_pwe_provider_payment` (`provider_payment_id`),
  CONSTRAINT `fk_pwe_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_pwe_sig_verified` CHECK (`signature_verified` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 72. refunds
CREATE TABLE IF NOT EXISTS `refunds` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `refund_reference` VARCHAR(64) NOT NULL,
  `payment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider_refund_id` VARCHAR(128) NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `refund_type` ENUM('FULL', 'PARTIAL') NOT NULL,
  `refund_status` ENUM('REQUESTED', 'PENDING_PROVIDER', 'PROCESSED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `reason` VARCHAR(500) NOT NULL,
  `initiated_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `approved_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `processed_at` DATETIME(6) NULL,
  `failure_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refunds_reference` (`refund_reference`),
  UNIQUE KEY `uq_refunds_idempotency` (`idempotency_key`),
  UNIQUE KEY `uq_refunds_provider_id` (`provider_refund_id`),
  KEY `idx_refunds_payment_status` (`payment_id`, `refund_status`),
  KEY `idx_refunds_initiated_by` (`initiated_by_user_id`),
  KEY `idx_refunds_approved_by` (`approved_by_user_id`),
  CONSTRAINT `fk_refunds_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_refunds_initiated_by` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_refunds_approved_by` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_refunds_amount` CHECK (`amount` > 0.00),
  CONSTRAINT `chk_refunds_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 73. payouts
-- Tracks seller/dealer/supplier settlement obligations separately from customer Checkout.
CREATE TABLE IF NOT EXISTS `payouts` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payout_reference` VARCHAR(64) NOT NULL,
  `recipient_type` ENUM('DIRECT_SELLER', 'DEALER', 'SUPPLIER') NOT NULL,
  `recipient_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `gross_amount` DECIMAL(14,2) NOT NULL,
  `platform_fee_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_withheld_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `net_payout_amount` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `payout_status` ENUM('OBLIGATION_RECORDED', 'APPROVED', 'PROCESSING', 'SETTLED', 'ON_HOLD', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'OBLIGATION_RECORDED',
  `settlement_reference` VARCHAR(128) NULL,
  `settled_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payouts_reference` (`payout_reference`),
  KEY `idx_payouts_recipient` (`recipient_type`, `recipient_user_id`, `payout_status`),
  KEY `idx_payouts_seller` (`seller_profile_id`),
  KEY `idx_payouts_dealer` (`dealer_profile_id`),
  KEY `idx_payouts_supplier` (`supplier_profile_id`),
  KEY `idx_payouts_retail_order` (`retail_order_id`),
  KEY `idx_payouts_wholesale_order` (`wholesale_order_id`),
  KEY `idx_payouts_supplier_po` (`supplier_purchase_order_id`),
  CONSTRAINT `fk_payouts_user` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payouts_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payouts_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payouts_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payouts_retail_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payouts_wholesale_order` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payouts_supplier_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_payouts_amounts` CHECK (`gross_amount` > 0.00 AND `platform_fee_amount` >= 0.00 AND `tax_withheld_amount` >= 0.00 AND `net_payout_amount` >= 0.00),
  CONSTRAINT `chk_payouts_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 74. shipments
CREATE TABLE IF NOT EXISTS `shipments` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `shipment_number` VARCHAR(64) NOT NULL,
  `shipment_scope` ENUM('RETAIL_FULFILMENT', 'WHOLESALE_ORDER', 'SUPPLIER_PROCUREMENT') NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `seller_fulfilment_group_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `origin_warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `carrier_name` VARCHAR(100) NULL,
  `tracking_number` VARCHAR(128) NULL,
  `shipment_status` ENUM('LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_ORIGIN', 'CANCELLED') NOT NULL DEFAULT 'LABEL_CREATED',
  `dispatched_at` DATETIME(6) NULL,
  `delivered_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shipments_number` (`shipment_number`),
  KEY `idx_shipments_tracking` (`carrier_name`, `tracking_number`),
  KEY `idx_shipments_retail` (`retail_order_id`),
  KEY `idx_shipments_sfg` (`seller_fulfilment_group_id`),
  KEY `idx_shipments_wholesale` (`wholesale_order_id`),
  KEY `idx_shipments_po` (`supplier_purchase_order_id`),
  KEY `idx_shipments_warehouse` (`origin_warehouse_id`),
  CONSTRAINT `fk_shipments_retail` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_shipments_sfg` FOREIGN KEY (`seller_fulfilment_group_id`) REFERENCES `seller_fulfilment_groups` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_shipments_wholesale` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_shipments_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_shipments_warehouse` FOREIGN KEY (`origin_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 75. shipment_items
CREATE TABLE IF NOT EXISTS `shipment_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `shipment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retail_order_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `supplier_po_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `shipped_quantity` DECIMAL(14,3) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_si_shipment` (`shipment_id`),
  KEY `idx_si_retail_item` (`retail_order_item_id`),
  KEY `idx_si_wholesale_item` (`wholesale_order_item_id`),
  KEY `idx_si_po_item` (`supplier_po_item_id`),
  CONSTRAINT `fk_si_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_si_retail_item` FOREIGN KEY (`retail_order_item_id`) REFERENCES `retail_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_si_wholesale_item` FOREIGN KEY (`wholesale_order_item_id`) REFERENCES `wholesale_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_si_po_item` FOREIGN KEY (`supplier_po_item_id`) REFERENCES `supplier_purchase_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_si_qty` CHECK (`shipped_quantity` > 0.000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 76. tracking_events
CREATE TABLE IF NOT EXISTS `tracking_events` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `shipment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider_event_id` VARCHAR(128) NULL,
  `event_status` VARCHAR(80) NOT NULL,
  `location_name` VARCHAR(160) NULL,
  `event_description` VARCHAR(500) NULL,
  `occurred_at` DATETIME(6) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_te_shipment_provider_event` (`shipment_id`, `provider_event_id`),
  KEY `idx_te_shipment_occurred` (`shipment_id`, `occurred_at`),
  CONSTRAINT `fk_te_shipment` FOREIGN KEY (`shipment_id`) REFERENCES `shipments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 77. return_requests
CREATE TABLE IF NOT EXISTS `return_requests` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `return_number` VARCHAR(64) NOT NULL,
  `order_scope` ENUM('RETAIL_ORDER', 'WHOLESALE_ORDER') NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `seller_fulfilment_group_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `payment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `requested_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason_code` VARCHAR(64) NOT NULL,
  `reason_details` TEXT NULL,
  `return_status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'RECEIVED', 'INSPECTED', 'REFUND_INITIATED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `requested_refund_amount` DECIMAL(14,2) NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rr_number` (`return_number`),
  KEY `idx_rr_user_status` (`requested_by_user_id`, `return_status`),
  KEY `idx_rr_retail` (`retail_order_id`),
  KEY `idx_rr_sfg` (`seller_fulfilment_group_id`),
  KEY `idx_rr_wholesale` (`wholesale_order_id`),
  KEY `idx_rr_payment` (`payment_id`),
  CONSTRAINT `fk_rr_user` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rr_retail` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rr_sfg` FOREIGN KEY (`seller_fulfilment_group_id`) REFERENCES `seller_fulfilment_groups` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rr_wholesale` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rr_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_rr_refund_amount` CHECK (`requested_refund_amount` IS NULL OR `requested_refund_amount` > 0.00),
  CONSTRAINT `chk_rr_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 78. return_status_history
CREATE TABLE IF NOT EXISTS `return_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `return_request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `notes` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_rsh_return_created` (`return_request_id`, `created_at`),
  KEY `idx_rsh_actor` (`actor_user_id`),
  CONSTRAINT `fk_rsh_return` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rsh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 79. return_items
CREATE TABLE IF NOT EXISTS `return_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `return_request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retail_order_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `return_quantity` DECIMAL(14,3) NOT NULL,
  `item_condition` ENUM('UNOPENED', 'OPENED_GOOD', 'DAMAGED', 'DEFECTIVE', 'WRONG_ITEM') NOT NULL DEFAULT 'OPENED_GOOD',
  `restock_approved` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_ri_return` (`return_request_id`),
  KEY `idx_ri_retail_item` (`retail_order_item_id`),
  KEY `idx_ri_wholesale_item` (`wholesale_order_item_id`),
  CONSTRAINT `fk_ri_return` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ri_retail_item` FOREIGN KEY (`retail_order_item_id`) REFERENCES `retail_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ri_wholesale_item` FOREIGN KEY (`wholesale_order_item_id`) REFERENCES `wholesale_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_ri_qty` CHECK (`return_quantity` > 0.000),
  CONSTRAINT `chk_ri_restock` CHECK (`restock_approved` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 80. product_reviews
CREATE TABLE IF NOT EXISTS `product_reviews` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reviewer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retail_order_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `title` VARCHAR(160) NULL,
  `review_body` TEXT NULL,
  `is_verified_purchase` TINYINT(1) NOT NULL DEFAULT 0,
  `moderation_status` ENUM('PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED') NOT NULL DEFAULT 'PUBLISHED',
  `seller_reply` TEXT NULL,
  `seller_replied_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pr_order_item_reviewer` (`retail_order_item_id`, `reviewer_user_id`),
  KEY `idx_pr_product_status` (`product_id`, `moderation_status`),
  KEY `idx_pr_variant` (`product_variant_id`),
  KEY `idx_pr_seller` (`seller_profile_id`),
  KEY `idx_pr_reviewer` (`reviewer_user_id`),
  CONSTRAINT `fk_pr_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pr_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_pr_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_pr_reviewer` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pr_order_item` FOREIGN KEY (`retail_order_item_id`) REFERENCES `retail_order_items` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_pr_rating` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `chk_pr_verified` CHECK (`is_verified_purchase` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
