-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/08_promotions_notifications_and_admin_operations.sql
-- Module H: Platform Operations, Promotions, Support & Immutable Audit (15 tables)
-- Tables:
--   81. coupons
--   82. coupon_usage
--   83. promotions
--   84. promotion_products
--   85. promotion_categories
--   86. notifications
--   87. support_tickets
--   88. support_ticket_messages
--   89. audit_logs
--   90. admin_action_requests
--   91. platform_settings
--   92. announcements
--   93. product_approval_history
--   94. dealer_status_history
--   95. supplier_status_history
-- Rules:
--   - `audit_logs` is append-only (protected by BEFORE UPDATE / BEFORE DELETE
--     triggers in 09_mysql_indexes_triggers_views_procedures.sql and least-privilege
--     grants in 12_create_database_users.example.sql).
--   - High-risk Admin actions support dual-control approval via `admin_action_requests`.
-- =============================================================================

USE `hunarlink`;

-- 81. coupons
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NULL,
  `discount_type` ENUM('PERCENTAGE', 'FIXED_AMOUNT') NOT NULL,
  `discount_value` DECIMAL(14,2) NOT NULL,
  `max_discount_amount` DECIMAL(14,2) NULL,
  `min_order_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `applicable_scope` ENUM('RETAIL', 'WHOLESALE', 'BOTH') NOT NULL DEFAULT 'RETAIL',
  `max_total_redemptions` INT UNSIGNED NULL,
  `max_per_user` INT UNSIGNED NOT NULL DEFAULT 1,
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupons_code` (`code`),
  KEY `idx_coupons_active_dates` (`is_active`, `starts_at`, `ends_at`),
  KEY `idx_coupons_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_coupons_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_coupons_value` CHECK (`discount_value` > 0.00 AND `min_order_amount` >= 0.00),
  CONSTRAINT `chk_coupons_pct` CHECK (`discount_type` <> 'PERCENTAGE' OR `discount_value` <= 100.00),
  CONSTRAINT `chk_coupons_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `chk_coupons_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 82. coupon_usage
CREATE TABLE IF NOT EXISTS `coupon_usage` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `coupon_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `discount_applied` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `used_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_cu_coupon_user` (`coupon_id`, `user_id`),
  KEY `idx_cu_user` (`user_id`),
  KEY `idx_cu_retail_order` (`retail_order_id`),
  KEY `idx_cu_wholesale_order` (`wholesale_order_id`),
  CONSTRAINT `fk_cu_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_cu_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_cu_retail_order` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_cu_wholesale_order` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_cu_discount` CHECK (`discount_applied` >= 0.00),
  CONSTRAINT `chk_cu_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 83. promotions
CREATE TABLE IF NOT EXISTS `promotions` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `promotion_type` ENUM('PERCENTAGE_OFF', 'FIXED_OFF', 'FREE_SHIPPING', 'BUNDLE') NOT NULL,
  `discount_value` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promotions_code` (`code`),
  KEY `idx_promotions_active_dates` (`is_active`, `starts_at`, `ends_at`),
  KEY `idx_promotions_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_promotions_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_promotions_value` CHECK (`discount_value` >= 0.00),
  CONSTRAINT `chk_promotions_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `chk_promotions_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 84. promotion_products
CREATE TABLE IF NOT EXISTS `promotion_products` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `promotion_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pp_promo_product` (`promotion_id`, `product_id`),
  KEY `idx_pp_product` (`product_id`),
  CONSTRAINT `fk_pp_promo` FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_pp_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 85. promotion_categories
CREATE TABLE IF NOT EXISTS `promotion_categories` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `promotion_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pc_promo_category` (`promotion_id`, `category_id`),
  KEY `idx_pc_category` (`category_id`),
  CONSTRAINT `fk_pc_promo` FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_pc_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 86. notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `channel` ENUM('IN_APP', 'EMAIL', 'SMS', 'WEBHOOK') NOT NULL DEFAULT 'IN_APP',
  `notification_type` VARCHAR(80) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `reference_type` VARCHAR(64) NULL,
  `reference_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `read_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_notif_user_read` (`user_id`, `is_read`, `created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `chk_notif_read` CHECK (`is_read` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 87. support_tickets
CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `ticket_number` VARCHAR(64) NOT NULL,
  `requester_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `assigned_admin_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `category` ENUM('ORDER_ISSUE', 'PAYMENT_ISSUE', 'RETURN_DISPUTE', 'GI_VERIFICATION', 'PROCUREMENT', 'ACCOUNT_ACCESS', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `ticket_status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `subject` VARCHAR(220) NOT NULL,
  `retail_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `wholesale_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `resolved_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_st_ticket_number` (`ticket_number`),
  KEY `idx_st_requester_status` (`requester_user_id`, `ticket_status`),
  KEY `idx_st_admin_status` (`assigned_admin_profile_id`, `ticket_status`),
  KEY `idx_st_retail` (`retail_order_id`),
  KEY `idx_st_wholesale` (`wholesale_order_id`),
  KEY `idx_st_po` (`supplier_purchase_order_id`),
  CONSTRAINT `fk_st_requester` FOREIGN KEY (`requester_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_st_admin` FOREIGN KEY (`assigned_admin_profile_id`) REFERENCES `admin_profiles` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_st_retail` FOREIGN KEY (`retail_order_id`) REFERENCES `retail_orders` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_st_wholesale` FOREIGN KEY (`wholesale_order_id`) REFERENCES `wholesale_orders` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_st_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 88. support_ticket_messages
CREATE TABLE IF NOT EXISTS `support_ticket_messages` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `support_ticket_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sender_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `is_internal_note` TINYINT(1) NOT NULL DEFAULT 0,
  `message_body` TEXT NOT NULL,
  `attachment_storage_key` VARCHAR(512) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_stm_ticket_created` (`support_ticket_id`, `created_at`),
  KEY `idx_stm_sender` (`sender_user_id`),
  CONSTRAINT `fk_stm_ticket` FOREIGN KEY (`support_ticket_id`) REFERENCES `support_tickets` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_stm_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_stm_internal` CHECK (`is_internal_note` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 89. audit_logs
-- Append-only immutable audit log. Never store passwords, secrets, or raw tokens.
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `actor_role` VARCHAR(64) NOT NULL,
  `action` VARCHAR(120) NOT NULL,
  `target_type` VARCHAR(80) NOT NULL,
  `target_id` VARCHAR(128) NOT NULL,
  `reason` VARCHAR(1000) NULL,
  `previous_values_json` JSON NULL,
  `new_values_json` JSON NULL,
  `correlation_id` VARCHAR(100) NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_audit_actor_created` (`actor_user_id`, `created_at`),
  KEY `idx_audit_target` (`target_type`, `target_id`),
  KEY `idx_audit_action_created` (`action`, `created_at`),
  KEY `idx_audit_correlation` (`correlation_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 90. admin_action_requests
-- Dual-control maker/checker approval workflow for high-risk Admin operations.
CREATE TABLE IF NOT EXISTS `admin_action_requests` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_type` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(80) NOT NULL,
  `target_id` VARCHAR(128) NOT NULL,
  `requested_payload_json` JSON NOT NULL,
  `request_reason` VARCHAR(1000) NOT NULL,
  `requested_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `approval_status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `review_reason` VARCHAR(1000) NULL,
  `reviewed_at` DATETIME(6) NULL,
  `executed_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_aar_status_created` (`approval_status`, `created_at`),
  KEY `idx_aar_requested_by` (`requested_by_user_id`),
  KEY `idx_aar_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_aar_requested_by` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_aar_reviewed_by` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_aar_dual_control` CHECK (`reviewed_by_user_id` IS NULL OR `reviewed_by_user_id` <> `requested_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 91. platform_settings
CREATE TABLE IF NOT EXISTS `platform_settings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value_json` JSON NOT NULL,
  `description` VARCHAR(500) NULL,
  `is_sensitive` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_platform_settings_key` (`setting_key`),
  KEY `idx_ps_updated_by` (`updated_by_user_id`),
  CONSTRAINT `fk_ps_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_ps_sensitive` CHECK (`is_sensitive` IN (0, 1)),
  CONSTRAINT `chk_ps_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 92. announcements
CREATE TABLE IF NOT EXISTS `announcements` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `audience_role_code` VARCHAR(50) NULL,
  `severity` ENUM('INFO', 'NOTICE', 'WARNING', 'MAINTENANCE') NOT NULL DEFAULT 'INFO',
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_ann_active_dates` (`is_active`, `starts_at`, `ends_at`),
  KEY `idx_ann_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_ann_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_ann_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 93. product_approval_history
CREATE TABLE IF NOT EXISTS `product_approval_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_wholesale_listing_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_pah_product_created` (`product_id`, `created_at`),
  KEY `idx_pah_seller_listing` (`seller_listing_id`),
  KEY `idx_pah_dealer_listing` (`dealer_wholesale_listing_id`),
  KEY `idx_pah_actor` (`actor_user_id`),
  CONSTRAINT `fk_pah_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pah_seller_listing` FOREIGN KEY (`seller_listing_id`) REFERENCES `seller_product_listings` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_pah_dealer_listing` FOREIGN KEY (`dealer_wholesale_listing_id`) REFERENCES `dealer_wholesale_listings` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_pah_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 94. dealer_status_history
CREATE TABLE IF NOT EXISTS `dealer_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status_field` ENUM('PROFILE_STATUS', 'VERIFICATION_STATUS') NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_dsh_dealer_created` (`dealer_profile_id`, `created_at`),
  KEY `idx_dsh_actor` (`actor_user_id`),
  CONSTRAINT `fk_dsh_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dsh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 95. supplier_status_history
CREATE TABLE IF NOT EXISTS `supplier_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status_field` ENUM('PROFILE_STATUS', 'VERIFICATION_STATUS') NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_ssh_supplier_created` (`supplier_profile_id`, `created_at`),
  KEY `idx_ssh_actor` (`actor_user_id`),
  CONSTRAINT `fk_ssh_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ssh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
