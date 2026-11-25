-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/05_inventory_and_retail.sql
-- Module E: Inventory and Retail Commerce (10 tables)
-- Tables:
--   44. warehouse_stock
--   45. inventory_transactions
--   46. carts
--   47. cart_items
--   48. wishlists
--   49. wishlist_items
--   50. retail_orders
--   51. seller_fulfilment_groups
--   52. retail_order_items
--   53. retail_order_status_history
-- Rules:
--   - Separate available, reserved, and damaged stock quantities (all >= 0).
--   - Accepted goods receipt updates dealer stock EXACTLY ONCE (enforced by
--     generated unique guard on inventory_transactions).
--   - One multi-seller retail order splits into separate seller_fulfilment_groups.
--   - Order items store immutable price/title/SKU/tax/discount snapshots.
-- =============================================================================

USE `hunarlink`;

-- 44. warehouse_stock
CREATE TABLE IF NOT EXISTS `warehouse_stock` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `owner_type` ENUM('SELLER', 'DEALER', 'PLATFORM') NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `seller_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `available_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `reserved_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `damaged_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `reorder_threshold` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `version` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ws_warehouse_variant_owner` (`warehouse_id`, `product_variant_id`, `owner_type`),
  KEY `idx_ws_product` (`product_id`),
  KEY `idx_ws_variant` (`product_variant_id`),
  KEY `idx_ws_seller` (`seller_profile_id`),
  KEY `idx_ws_dealer` (`dealer_profile_id`),
  KEY `idx_ws_seller_listing` (`seller_listing_id`),
  CONSTRAINT `fk_ws_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ws_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ws_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ws_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ws_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ws_seller_listing` FOREIGN KEY (`seller_listing_id`) REFERENCES `seller_product_listings` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_ws_non_negative` CHECK (`available_quantity` >= 0.000 AND `reserved_quantity` >= 0.000 AND `damaged_quantity` >= 0.000 AND `reorder_threshold` >= 0.000),
  CONSTRAINT `chk_ws_owner_match` CHECK (
    (`owner_type` = 'SELLER' AND `seller_profile_id` IS NOT NULL AND `dealer_profile_id` IS NULL)
    OR (`owner_type` = 'DEALER' AND `dealer_profile_id` IS NOT NULL AND `seller_profile_id` IS NULL)
    OR (`owner_type` = 'PLATFORM' AND `seller_profile_id` IS NULL AND `dealer_profile_id` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 45. inventory_transactions
-- Immutable ledger of every stock movement. Generated column guarantees each
-- goods_receipt_item can post accepted dealer stock AT MOST ONCE.
CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_stock_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `goods_receipt_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `movement_type` ENUM('OPENING_BALANCE', 'GOODS_RECEIPT_ACCEPT', 'GOODS_RECEIPT_DAMAGED', 'RESERVE', 'RELEASE_RESERVATION', 'CONSUME_RESERVATION', 'RETURN_RESTOCK', 'DAMAGE_WRITE_OFF', 'MANUAL_ADJUSTMENT') NOT NULL,
  `quantity_delta` DECIMAL(14,3) NOT NULL,
  `available_after` DECIMAL(14,3) NOT NULL,
  `reserved_after` DECIMAL(14,3) NOT NULL,
  `damaged_after` DECIMAL(14,3) NOT NULL,
  `reference_type` VARCHAR(64) NULL,
  `reference_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `goods_receipt_post_guard` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (
    IF(`movement_type` = 'GOODS_RECEIPT_ACCEPT' AND `goods_receipt_item_id` IS NOT NULL, `goods_receipt_item_id`, NULL)
  ) STORED,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(500) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_tx_single_gr_post` (`goods_receipt_post_guard`),
  KEY `idx_inv_tx_stock_created` (`warehouse_stock_id`, `created_at`),
  KEY `idx_inv_tx_warehouse` (`warehouse_id`),
  KEY `idx_inv_tx_variant` (`product_variant_id`),
  KEY `idx_inv_tx_gr_item` (`goods_receipt_item_id`),
  KEY `idx_inv_tx_ref` (`reference_type`, `reference_id`),
  KEY `idx_inv_tx_actor` (`actor_user_id`),
  CONSTRAINT `fk_inv_tx_stock` FOREIGN KEY (`warehouse_stock_id`) REFERENCES `warehouse_stock` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_inv_tx_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_inv_tx_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_inv_tx_gr_item` FOREIGN KEY (`goods_receipt_item_id`) REFERENCES `goods_receipt_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_inv_tx_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_inv_tx_balances` CHECK (`available_after` >= 0.000 AND `reserved_after` >= 0.000 AND `damaged_after` >= 0.000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 46. carts
CREATE TABLE IF NOT EXISTS `carts` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `cart_status` ENUM('ACTIVE', 'CONVERTED', 'ABANDONED') NOT NULL DEFAULT 'ACTIVE',
  `active_cart_guard` TINYINT(1) GENERATED ALWAYS AS (IF(`cart_status` = 'ACTIVE', 1, NULL)) STORED,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `applied_coupon_code` VARCHAR(64) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_carts_user_active` (`user_id`, `active_cart_guard`),
  KEY `idx_carts_user_status` (`user_id`, `cart_status`),
  CONSTRAINT `fk_carts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_carts_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 47. cart_items
CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `cart_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price_snapshot` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_items_cart_listing` (`cart_id`, `seller_listing_id`),
  KEY `idx_ci_listing` (`seller_listing_id`),
  KEY `idx_ci_variant` (`product_variant_id`),
  CONSTRAINT `fk_ci_cart` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_ci_listing` FOREIGN KEY (`seller_listing_id`) REFERENCES `seller_product_listings` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ci_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_ci_qty` CHECK (`quantity` >= 1),
  CONSTRAINT `chk_ci_price` CHECK (`unit_price_snapshot` > 0.00),
  CONSTRAINT `chk_ci_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 48. wishlists
CREATE TABLE IF NOT EXISTS `wishlists` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(100) NOT NULL DEFAULT 'Saved Crafts',
  `is_default` TINYINT(1) NOT NULL DEFAULT 1,
  `default_wishlist_guard` TINYINT(1) GENERATED ALWAYS AS (IF(`is_default` = 1, 1, NULL)) STORED,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishlists_user_default` (`user_id`, `default_wishlist_guard`),
  KEY `idx_wishlists_user` (`user_id`),
  CONSTRAINT `fk_wishlists_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_wishlists_default` CHECK (`is_default` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 49. wishlist_items
CREATE TABLE IF NOT EXISTS `wishlist_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wishlist_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `seller_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wishlist_items_unique` (`wishlist_id`, `product_id`),
  KEY `idx_wi_product` (`product_id`),
  KEY `idx_wi_variant` (`product_variant_id`),
  KEY `idx_wi_listing` (`seller_listing_id`),
  CONSTRAINT `fk_wi_wishlist` FOREIGN KEY (`wishlist_id`) REFERENCES `wishlists` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_wi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wi_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_wi_listing` FOREIGN KEY (`seller_listing_id`) REFERENCES `seller_product_listings` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 50. retail_orders
-- Customer order header. Payment status is tracked separately from fulfilment status.
CREATE TABLE IF NOT EXISTS `retail_orders` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_number` VARCHAR(64) NOT NULL,
  `customer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `shipping_address_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `shipping_address_snapshot_json` JSON NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `subtotal_amount` DECIMAL(14,2) NOT NULL,
  `discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL,
  `coupon_code_snapshot` VARCHAR(64) NULL,
  `payment_method` ENUM('RAZORPAY_STANDARD', 'COD') NOT NULL DEFAULT 'RAZORPAY_STANDARD',
  `payment_status` ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'COD_PENDING', 'COD_COLLECTED') NOT NULL DEFAULT 'PENDING',
  `fulfilment_status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `placed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `confirmed_at` DATETIME(6) NULL,
  `cancelled_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_retail_orders_number` (`order_number`),
  KEY `idx_ro_customer_created` (`customer_user_id`, `created_at`),
  KEY `idx_ro_statuses` (`payment_status`, `fulfilment_status`),
  KEY `idx_ro_shipping_addr` (`shipping_address_id`),
  CONSTRAINT `fk_ro_customer` FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ro_shipping_addr` FOREIGN KEY (`shipping_address_id`) REFERENCES `user_addresses` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_ro_amounts` CHECK (`subtotal_amount` >= 0.00 AND `discount_amount` >= 0.00 AND `tax_amount` >= 0.00 AND `shipping_fee` >= 0.00 AND `total_amount` >= 0.00),
  CONSTRAINT `chk_ro_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 51. seller_fulfilment_groups
-- Multi-seller retail checkout splits cleanly into one fulfilment group per seller.
CREATE TABLE IF NOT EXISTS `seller_fulfilment_groups` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `fulfilment_number` VARCHAR(64) NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `subtotal_amount` DECIMAL(14,2) NOT NULL,
  `discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `group_total_amount` DECIMAL(14,2) NOT NULL,
  `fulfilment_status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `seller_notes` VARCHAR(500) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sfg_number` (`fulfilment_number`),
  UNIQUE KEY `uq_sfg_order_seller` (`retail_order_id`, `seller_profile_id`),
  KEY `idx_sfg_seller_status` (`seller_profile_id`, `fulfilment_status`),
  KEY `idx_sfg_warehouse` (`warehouse_id`),
  CONSTRAINT `fk_sfg_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sfg_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sfg_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_sfg_amounts` CHECK (`subtotal_amount` >= 0.00 AND `discount_amount` >= 0.00 AND `tax_amount` >= 0.00 AND `shipping_fee` >= 0.00 AND `group_total_amount` >= 0.00),
  CONSTRAINT `chk_sfg_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 52. retail_order_items
-- Stores immutable snapshots so future catalogue edits never alter historical orders.
CREATE TABLE IF NOT EXISTS `retail_order_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_fulfilment_group_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_name_snapshot` VARCHAR(220) NOT NULL,
  `sku_snapshot` VARCHAR(100) NOT NULL,
  `gi_status_snapshot` VARCHAR(40) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `unit_price_snapshot` DECIMAL(14,2) NOT NULL,
  `discount_amount_snapshot` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount_snapshot` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `line_total_amount` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_roi_order` (`retail_order_id`),
  KEY `idx_roi_group` (`seller_fulfilment_group_id`),
  KEY `idx_roi_listing` (`seller_listing_id`),
  KEY `idx_roi_product` (`product_id`),
  KEY `idx_roi_variant` (`product_variant_id`),
  CONSTRAINT `fk_roi_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_roi_group` FOREIGN KEY (`seller_fulfilment_group_id`) REFERENCES `seller_fulfilment_groups` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_roi_listing` FOREIGN KEY (`seller_listing_id`) REFERENCES `seller_product_listings` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_roi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_roi_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_roi_qty` CHECK (`quantity` >= 1),
  CONSTRAINT `chk_roi_amounts` CHECK (`unit_price_snapshot` > 0.00 AND `discount_amount_snapshot` >= 0.00 AND `tax_amount_snapshot` >= 0.00 AND `line_total_amount` >= 0.00),
  CONSTRAINT `chk_roi_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 53. retail_order_status_history
CREATE TABLE IF NOT EXISTS `retail_order_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_fulfilment_group_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `status_scope` ENUM('ORDER_FULFILMENT', 'SELLER_FULFILMENT', 'PAYMENT_SYNC') NOT NULL DEFAULT 'ORDER_FULFILMENT',
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_rosh_order_created` (`retail_order_id`, `created_at`),
  KEY `idx_rosh_group` (`seller_fulfilment_group_id`),
  KEY `idx_rosh_actor` (`actor_user_id`),
  CONSTRAINT `fk_rosh_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rosh_group` FOREIGN KEY (`seller_fulfilment_group_id`) REFERENCES `seller_fulfilment_groups` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rosh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
