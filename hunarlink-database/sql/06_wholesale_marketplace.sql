-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/06_wholesale_marketplace.sql
-- Module C (Dealer Wholesale Listing) & Module F: Wholesale Marketplace (14 tables)
-- Tables:
--   54. dealer_wholesale_listings
--   55. wholesale_buyer_profiles
--   56. wholesale_price_tiers
--   57. wholesale_carts
--   58. wholesale_cart_items
--   59. wholesale_rfqs
--   60. wholesale_rfq_items
--   61. rfq_dealer_invitations
--   62. dealer_quotes
--   63. dealer_quote_items
--   64. wholesale_orders
--   65. wholesale_order_items
--   66. wholesale_order_status_history
--   67. stock_reservations
-- Rules:
--   - Supports MOQ, bulk availability, and quantity-based price tiers.
--   - Buyer creates an RFQ; dealers submit quotes; buyer accepts a valid quote.
--   - In v1, one wholesale order is fulfilled by one dealer.
--   - Accepted quote must belong to the buyer's RFQ and selected dealer.
-- =============================================================================

USE `hunarlink`;

-- 54. dealer_wholesale_listings
CREATE TABLE IF NOT EXISTS `dealer_wholesale_listings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_stock_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_sku` VARCHAR(100) NOT NULL,
  `listing_title` VARCHAR(220) NOT NULL,
  `base_unit_price` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `minimum_order_quantity` DECIMAL(14,3) NOT NULL,
  `order_quantity_increment` DECIMAL(14,3) NOT NULL DEFAULT 1.000,
  `lead_time_days` SMALLINT UNSIGNED NOT NULL DEFAULT 14,
  `listing_status` ENUM('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `published_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dwl_dealer_sku` (`dealer_profile_id`, `dealer_sku`),
  KEY `idx_dwl_product_status` (`product_id`, `listing_status`),
  KEY `idx_dwl_variant_status` (`product_variant_id`, `listing_status`),
  KEY `idx_dwl_warehouse` (`warehouse_id`),
  KEY `idx_dwl_stock` (`warehouse_stock_id`),
  CONSTRAINT `fk_dwl_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dwl_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dwl_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dwl_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dwl_stock` FOREIGN KEY (`warehouse_stock_id`) REFERENCES `warehouse_stock` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_dwl_price` CHECK (`base_unit_price` > 0.00),
  CONSTRAINT `chk_dwl_moq` CHECK (`minimum_order_quantity` > 0.000 AND `order_quantity_increment` > 0.000),
  CONSTRAINT `chk_dwl_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 55. wholesale_buyer_profiles
CREATE TABLE IF NOT EXISTS `wholesale_buyer_profiles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `company_name` VARCHAR(200) NOT NULL,
  `buyer_segment` ENUM('RETAIL_BOUTIQUE', 'HOSPITALITY', 'INTERIOR_STUDIO', 'EXPORTER', 'CORPORATE_GIFTING', 'OTHER') NOT NULL DEFAULT 'RETAIL_BOUTIQUE',
  `gstin` VARCHAR(20) NULL,
  `business_city` VARCHAR(100) NOT NULL,
  `business_state` VARCHAR(100) NOT NULL,
  `country_code` CHAR(2) NOT NULL DEFAULT 'IN',
  `profile_status` ENUM('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
  `verification_status` ENUM('UNVERIFIED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'UNVERIFIED',
  `approved_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wbp_user_id` (`user_id`),
  KEY `idx_wbp_status` (`profile_status`, `verification_status`),
  CONSTRAINT `fk_wbp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 56. wholesale_price_tiers
CREATE TABLE IF NOT EXISTS `wholesale_price_tiers` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_wholesale_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `min_quantity` DECIMAL(14,3) NOT NULL,
  `max_quantity` DECIMAL(14,3) NULL,
  `unit_price` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wpt_listing_min_qty` (`dealer_wholesale_listing_id`, `min_quantity`),
  KEY `idx_wpt_listing_active` (`dealer_wholesale_listing_id`, `is_active`),
  CONSTRAINT `fk_wpt_listing` FOREIGN KEY (`dealer_wholesale_listing_id`) REFERENCES `dealer_wholesale_listings` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `chk_wpt_qty` CHECK (`min_quantity` > 0.000 AND (`max_quantity` IS NULL OR `max_quantity` >= `min_quantity`)),
  CONSTRAINT `chk_wpt_price` CHECK (`unit_price` > 0.00),
  CONSTRAINT `chk_wpt_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3),
  CONSTRAINT `chk_wpt_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 57. wholesale_carts
CREATE TABLE IF NOT EXISTS `wholesale_carts` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_buyer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `cart_status` ENUM('ACTIVE', 'CONVERTED', 'ABANDONED') NOT NULL DEFAULT 'ACTIVE',
  `active_cart_guard` TINYINT(1) GENERATED ALWAYS AS (IF(`cart_status` = 'ACTIVE', 1, NULL)) STORED,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wc_buyer_active` (`wholesale_buyer_profile_id`, `active_cart_guard`),
  KEY `idx_wc_user` (`user_id`),
  CONSTRAINT `fk_wc_buyer` FOREIGN KEY (`wholesale_buyer_profile_id`) REFERENCES `wholesale_buyer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_wc_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 58. wholesale_cart_items
CREATE TABLE IF NOT EXISTS `wholesale_cart_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_cart_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_wholesale_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `quantity` DECIMAL(14,3) NOT NULL,
  `tier_unit_price_snapshot` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wci_cart_listing` (`wholesale_cart_id`, `dealer_wholesale_listing_id`),
  KEY `idx_wci_listing` (`dealer_wholesale_listing_id`),
  KEY `idx_wci_variant` (`product_variant_id`),
  CONSTRAINT `fk_wci_cart` FOREIGN KEY (`wholesale_cart_id`) REFERENCES `wholesale_carts` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_wci_listing` FOREIGN KEY (`dealer_wholesale_listing_id`) REFERENCES `dealer_wholesale_listings` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wci_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_wci_qty` CHECK (`quantity` > 0.000),
  CONSTRAINT `chk_wci_price` CHECK (`tier_unit_price_snapshot` > 0.00),
  CONSTRAINT `chk_wci_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 59. wholesale_rfqs
CREATE TABLE IF NOT EXISTS `wholesale_rfqs` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `rfq_number` VARCHAR(64) NOT NULL,
  `wholesale_buyer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `buyer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `delivery_address_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `title` VARCHAR(220) NOT NULL,
  `requirements_notes` TEXT NULL,
  `target_delivery_date` DATE NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `rfq_status` ENUM('DRAFT', 'OPEN', 'QUOTES_RECEIVED', 'QUOTE_ACCEPTED', 'EXPIRED', 'CANCELLED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
  `expires_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wrfq_number` (`rfq_number`),
  KEY `idx_wrfq_buyer_status` (`wholesale_buyer_profile_id`, `rfq_status`),
  KEY `idx_wrfq_user` (`buyer_user_id`),
  KEY `idx_wrfq_delivery_addr` (`delivery_address_id`),
  CONSTRAINT `fk_wrfq_buyer` FOREIGN KEY (`wholesale_buyer_profile_id`) REFERENCES `wholesale_buyer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wrfq_user` FOREIGN KEY (`buyer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wrfq_delivery_addr` FOREIGN KEY (`delivery_address_id`) REFERENCES `user_addresses` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_wrfq_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 60. wholesale_rfq_items
CREATE TABLE IF NOT EXISTS `wholesale_rfq_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_rfq_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `item_description` VARCHAR(300) NOT NULL,
  `requested_quantity` DECIMAL(14,3) NOT NULL,
  `unit_of_measure` VARCHAR(32) NOT NULL DEFAULT 'PCS',
  `target_unit_price` DECIMAL(14,2) NULL,
  `requires_gi_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_wrfqi_rfq` (`wholesale_rfq_id`),
  KEY `idx_wrfqi_category` (`category_id`),
  KEY `idx_wrfqi_product` (`product_id`),
  KEY `idx_wrfqi_variant` (`product_variant_id`),
  CONSTRAINT `fk_wrfqi_rfq` FOREIGN KEY (`wholesale_rfq_id`) REFERENCES `wholesale_rfqs` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_wrfqi_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wrfqi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_wrfqi_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_wrfqi_qty` CHECK (`requested_quantity` > 0.000),
  CONSTRAINT `chk_wrfqi_price` CHECK (`target_unit_price` IS NULL OR `target_unit_price` > 0.00),
  CONSTRAINT `chk_wrfqi_gi` CHECK (`requires_gi_verified` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 61. rfq_dealer_invitations
CREATE TABLE IF NOT EXISTS `rfq_dealer_invitations` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_rfq_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `invited_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `invitation_status` ENUM('INVITED', 'VIEWED', 'QUOTED', 'DECLINED', 'EXPIRED') NOT NULL DEFAULT 'INVITED',
  `invited_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `responded_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rdi_rfq_dealer` (`wholesale_rfq_id`, `dealer_profile_id`),
  KEY `idx_rdi_dealer_status` (`dealer_profile_id`, `invitation_status`),
  KEY `idx_rdi_invited_by` (`invited_by_user_id`),
  CONSTRAINT `fk_rdi_rfq` FOREIGN KEY (`wholesale_rfq_id`) REFERENCES `wholesale_rfqs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rdi_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_rdi_invited_by` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 62. dealer_quotes
CREATE TABLE IF NOT EXISTS `dealer_quotes` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `quote_number` VARCHAR(64) NOT NULL,
  `wholesale_rfq_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `rfq_invitation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `submitted_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `subtotal_amount` DECIMAL(14,2) NOT NULL,
  `discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL,
  `lead_time_days` SMALLINT UNSIGNED NOT NULL DEFAULT 14,
  `valid_until` DATETIME(6) NOT NULL,
  `quote_status` ENUM('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'CONVERTED_TO_ORDER') NOT NULL DEFAULT 'DRAFT',
  `terms_notes` TEXT NULL,
  `accepted_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dq_number` (`quote_number`),
  KEY `idx_dq_rfq_status` (`wholesale_rfq_id`, `quote_status`),
  KEY `idx_dq_dealer_status` (`dealer_profile_id`, `quote_status`),
  KEY `idx_dq_invitation` (`rfq_invitation_id`),
  KEY `idx_dq_submitted_by` (`submitted_by_user_id`),
  CONSTRAINT `fk_dq_rfq` FOREIGN KEY (`wholesale_rfq_id`) REFERENCES `wholesale_rfqs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dq_invitation` FOREIGN KEY (`rfq_invitation_id`) REFERENCES `rfq_dealer_invitations` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_dq_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dq_submitted_by` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dq_amounts` CHECK (`subtotal_amount` >= 0.00 AND `discount_amount` >= 0.00 AND `tax_amount` >= 0.00 AND `shipping_fee` >= 0.00 AND `total_amount` > 0.00),
  CONSTRAINT `chk_dq_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 63. dealer_quote_items
CREATE TABLE IF NOT EXISTS `dealer_quote_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_quote_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_rfq_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_wholesale_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `item_title_snapshot` VARCHAR(220) NOT NULL,
  `quoted_quantity` DECIMAL(14,3) NOT NULL,
  `unit_price` DECIMAL(14,2) NOT NULL,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_dqi_quote` (`dealer_quote_id`),
  KEY `idx_dqi_rfq_item` (`wholesale_rfq_item_id`),
  KEY `idx_dqi_listing` (`dealer_wholesale_listing_id`),
  KEY `idx_dqi_variant` (`product_variant_id`),
  CONSTRAINT `fk_dqi_quote` FOREIGN KEY (`dealer_quote_id`) REFERENCES `dealer_quotes` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_dqi_rfq_item` FOREIGN KEY (`wholesale_rfq_item_id`) REFERENCES `wholesale_rfq_items` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_dqi_listing` FOREIGN KEY (`dealer_wholesale_listing_id`) REFERENCES `dealer_wholesale_listings` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_dqi_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dqi_qty` CHECK (`quoted_quantity` > 0.000),
  CONSTRAINT `chk_dqi_amounts` CHECK (`unit_price` > 0.00 AND `tax_amount` >= 0.00 AND `line_total` > 0.00),
  CONSTRAINT `chk_dqi_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 64. wholesale_orders
-- One dealer per wholesale order in v1; strictly separate from retail & supplier POs.
CREATE TABLE IF NOT EXISTS `wholesale_orders` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_number` VARCHAR(64) NOT NULL,
  `wholesale_buyer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `buyer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `order_source` ENUM('DIRECT_BULK', 'ACCEPTED_RFQ_QUOTE') NOT NULL,
  `wholesale_rfq_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_quote_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `shipping_address_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `shipping_address_snapshot_json` JSON NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `subtotal_amount` DECIMAL(14,2) NOT NULL,
  `discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL,
  `payment_method` ENUM('RAZORPAY_STANDARD', 'COD', 'BANK_TRANSFER_VERIFIED') NOT NULL DEFAULT 'RAZORPAY_STANDARD',
  `payment_status` ENUM('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'COD_PENDING', 'COD_COLLECTED') NOT NULL DEFAULT 'PENDING',
  `fulfilment_status` ENUM('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `confirmed_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wo_number` (`order_number`),
  UNIQUE KEY `uq_wo_dealer_quote` (`dealer_quote_id`),
  KEY `idx_wo_buyer_created` (`wholesale_buyer_profile_id`, `created_at`),
  KEY `idx_wo_buyer_user` (`buyer_user_id`),
  KEY `idx_wo_dealer_status` (`dealer_profile_id`, `fulfilment_status`),
  KEY `idx_wo_rfq` (`wholesale_rfq_id`),
  KEY `idx_wo_shipping_addr` (`shipping_address_id`),
  KEY `idx_wo_statuses` (`payment_status`, `fulfilment_status`),
  CONSTRAINT `fk_wo_buyer_profile` FOREIGN KEY (`wholesale_buyer_profile_id`) REFERENCES `wholesale_buyer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wo_buyer_user` FOREIGN KEY (`buyer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wo_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wo_rfq` FOREIGN KEY (`wholesale_rfq_id`) REFERENCES `wholesale_rfqs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wo_quote` FOREIGN KEY (`dealer_quote_id`) REFERENCES `dealer_quotes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wo_shipping_addr` FOREIGN KEY (`shipping_address_id`) REFERENCES `user_addresses` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_wo_amounts` CHECK (`subtotal_amount` >= 0.00 AND `discount_amount` >= 0.00 AND `tax_amount` >= 0.00 AND `shipping_fee` >= 0.00 AND `total_amount` > 0.00),
  CONSTRAINT `chk_wo_source_quote` CHECK (
    (`order_source` = 'DIRECT_BULK' AND `dealer_quote_id` IS NULL)
    OR (`order_source` = 'ACCEPTED_RFQ_QUOTE' AND `wholesale_rfq_id` IS NOT NULL AND `dealer_quote_id` IS NOT NULL)
  ),
  CONSTRAINT `chk_wo_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 65. wholesale_order_items
CREATE TABLE IF NOT EXISTS `wholesale_order_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_wholesale_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_quote_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_name_snapshot` VARCHAR(220) NOT NULL,
  `sku_snapshot` VARCHAR(100) NOT NULL,
  `quantity` DECIMAL(14,3) NOT NULL,
  `unit_price_snapshot` DECIMAL(14,2) NOT NULL,
  `discount_amount_snapshot` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `tax_amount_snapshot` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `line_total_amount` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_woi_order` (`wholesale_order_id`),
  KEY `idx_woi_listing` (`dealer_wholesale_listing_id`),
  KEY `idx_woi_quote_item` (`dealer_quote_item_id`),
  KEY `idx_woi_product` (`product_id`),
  KEY `idx_woi_variant` (`product_variant_id`),
  CONSTRAINT `fk_woi_order` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_woi_listing` FOREIGN KEY (`dealer_wholesale_listing_id`) REFERENCES `dealer_wholesale_listings` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_woi_quote_item` FOREIGN KEY (`dealer_quote_item_id`) REFERENCES `dealer_quote_items` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_woi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_woi_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_woi_qty` CHECK (`quantity` > 0.000),
  CONSTRAINT `chk_woi_amounts` CHECK (`unit_price_snapshot` > 0.00 AND `discount_amount_snapshot` >= 0.00 AND `tax_amount_snapshot` >= 0.00 AND `line_total_amount` > 0.00),
  CONSTRAINT `chk_woi_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 66. wholesale_order_status_history
CREATE TABLE IF NOT EXISTS `wholesale_order_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status_scope` ENUM('ORDER_FULFILMENT', 'PAYMENT_SYNC') NOT NULL DEFAULT 'ORDER_FULFILMENT',
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_wosh_order_created` (`wholesale_order_id`, `created_at`),
  KEY `idx_wosh_actor` (`actor_user_id`),
  CONSTRAINT `fk_wosh_order` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wosh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 67. stock_reservations
-- Holds inventory during checkout for either a retail or wholesale order.
CREATE TABLE IF NOT EXISTS `stock_reservations` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_stock_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reservation_scope` ENUM('RETAIL_ORDER', 'WHOLESALE_ORDER') NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reserved_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reserved_quantity` DECIMAL(14,3) NOT NULL,
  `reservation_status` ENUM('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `expires_at` DATETIME(6) NOT NULL,
  `resolved_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_sr_stock_status` (`warehouse_stock_id`, `reservation_status`),
  KEY `idx_sr_retail_order` (`retail_order_id`),
  KEY `idx_sr_wholesale_order` (`wholesale_order_id`),
  KEY `idx_sr_user` (`reserved_by_user_id`),
  KEY `idx_sr_expires` (`reservation_status`, `expires_at`),
  CONSTRAINT `fk_sr_stock` FOREIGN KEY (`warehouse_stock_id`) REFERENCES `warehouse_stock` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sr_retail_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sr_wholesale_order` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sr_user` FOREIGN KEY (`reserved_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_sr_qty` CHECK (`reserved_quantity` > 0.000),
  CONSTRAINT `chk_sr_scope_target` CHECK (
    (`reservation_scope` = 'RETAIL_ORDER' AND `retail_order_id` IS NOT NULL AND `wholesale_order_id` IS NULL)
    OR (`reservation_scope` = 'WHOLESALE_ORDER' AND `wholesale_order_id` IS NOT NULL AND `retail_order_id` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
