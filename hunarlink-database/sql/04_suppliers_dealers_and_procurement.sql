-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/04_suppliers_dealers_and_procurement.sql
-- Module D: Suppliers, Dealers & Procurement (20 tables)
-- Tables:
--   24. supplier_profiles
--   25. supplier_verification_applications
--   26. supplier_documents
--   27. supplier_verification_history
--   28. supplier_lots
--   29. supplier_lot_documents
--   30. supplier_lot_status_history
--   31. dealer_profiles
--   32. dealer_documents
--   33. dealer_categories
--   34. warehouses
--   35. dealer_assignment_recommendations
--   36. dealer_assignments
--   37. dealer_assignment_history
--   38. supplier_purchase_orders
--   39. supplier_purchase_order_status_history
--   40. supplier_purchase_order_items
--   41. goods_receipts
--   42. goods_receipt_items
--   43. quality_inspections
-- Rules:
--   - A supplier lot is an offered supply quantity, NOT a catalogue listing.
--   - A dealer assignment is an invitation; it does NOT transfer ownership or stock.
--   - A purchase order is created ONLY after dealer acceptance & commercial agreement.
--   - Received/accepted qty enters dealer stock ONLY after goods receipt & inspection.
--   - Supplier purchase orders stay strictly separate from retail/wholesale orders.
-- =============================================================================

USE `hunarlink`;

-- 24. supplier_profiles
CREATE TABLE IF NOT EXISTS `supplier_profiles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_name` VARCHAR(180) NOT NULL,
  `legal_entity_name` VARCHAR(200) NULL,
  `supplier_type` ENUM('PRODUCER', 'ARTISAN_COOPERATIVE', 'WEAVER_CLUSTER', 'MANUFACTURER', 'AGGREGATOR') NOT NULL DEFAULT 'PRODUCER',
  `craft_cluster` VARCHAR(140) NULL,
  `district` VARCHAR(100) NULL,
  `state_province` VARCHAR(100) NOT NULL DEFAULT 'Jammu & Kashmir',
  `gstin` VARCHAR(20) NULL,
  `profile_status` ENUM('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
  `verification_status` ENUM('UNVERIFIED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'UNVERIFIED',
  `monthly_capacity_units` INT UNSIGNED NULL,
  `approved_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_profiles_user_id` (`user_id`),
  KEY `idx_supplier_profiles_status` (`profile_status`, `verification_status`),
  CONSTRAINT `fk_supplier_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 25. supplier_verification_applications
CREATE TABLE IF NOT EXISTS `supplier_verification_applications` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_number` VARCHAR(64) NOT NULL,
  `application_status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
  `submitted_metadata` JSON NULL,
  `submitted_at` DATETIME(6) NULL,
  `reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reviewed_at` DATETIME(6) NULL,
  `review_notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sup_va_app_number` (`application_number`),
  KEY `idx_sup_va_supplier_status` (`supplier_profile_id`, `application_status`),
  KEY `idx_sup_va_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_sup_va_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sup_va_reviewed_by` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 26. supplier_documents
CREATE TABLE IF NOT EXISTS `supplier_documents` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `document_type` ENUM('IDENTITY_PROOF', 'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'WORKSHOP_PROOF', 'BANK_PROOF', 'QUALITY_CERT', 'OTHER') NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `detected_mime_type` VARCHAR(120) NOT NULL,
  `file_size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `scan_status` ENUM('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_ERROR') NOT NULL DEFAULT 'PENDING_SCAN',
  `verification_status` ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `uploaded_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_docs_storage_key` (`storage_key`),
  KEY `idx_sup_docs_supplier` (`supplier_profile_id`),
  KEY `idx_sup_docs_app` (`application_id`),
  KEY `idx_sup_docs_hash` (`sha256_hash`),
  KEY `idx_sup_docs_uploaded_by` (`uploaded_by_user_id`),
  CONSTRAINT `fk_sup_docs_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sup_docs_app` FOREIGN KEY (`application_id`) REFERENCES `supplier_verification_applications` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sup_docs_uploaded_by` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_sup_docs_size` CHECK (`file_size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 27. supplier_verification_history
CREATE TABLE IF NOT EXISTS `supplier_verification_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `correlation_id` VARCHAR(100) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_sup_vh_app` (`application_id`, `created_at`),
  KEY `idx_sup_vh_supplier` (`supplier_profile_id`),
  KEY `idx_sup_vh_actor` (`actor_user_id`),
  CONSTRAINT `fk_sup_vh_app` FOREIGN KEY (`application_id`) REFERENCES `supplier_verification_applications` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sup_vh_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sup_vh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 28. supplier_lots
CREATE TABLE IF NOT EXISTS `supplier_lots` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lot_number` VARCHAR(64) NOT NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `lot_title` VARCHAR(220) NOT NULL,
  `lot_description` TEXT NULL,
  `offered_quantity` DECIMAL(14,3) NOT NULL,
  `remaining_quantity` DECIMAL(14,3) NOT NULL,
  `unit_of_measure` VARCHAR(32) NOT NULL DEFAULT 'PCS',
  `expected_unit_price` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `is_gi_claimed` TINYINT(1) NOT NULL DEFAULT 0,
  `available_from_date` DATE NOT NULL,
  `available_until_date` DATE NULL,
  `origin_location` VARCHAR(160) NULL,
  `lot_status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED_FOR_MATCHING', 'ASSIGNED', 'PARTIALLY_PROCURED', 'PROCURED', 'REJECTED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reviewed_at` DATETIME(6) NULL,
  `review_notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplier_lots_number` (`lot_number`),
  KEY `idx_sl_supplier_status` (`supplier_profile_id`, `lot_status`),
  KEY `idx_sl_category_status` (`category_id`, `lot_status`),
  KEY `idx_sl_product` (`product_id`),
  KEY `idx_sl_variant` (`product_variant_id`),
  KEY `idx_sl_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_sl_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sl_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sl_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_sl_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_sl_reviewed_by` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_sl_offered_qty` CHECK (`offered_quantity` > 0.000),
  CONSTRAINT `chk_sl_remaining_qty` CHECK (`remaining_quantity` >= 0.000 AND `remaining_quantity` <= `offered_quantity`),
  CONSTRAINT `chk_sl_price` CHECK (`expected_unit_price` > 0.00),
  CONSTRAINT `chk_sl_gi_claimed` CHECK (`is_gi_claimed` IN (0, 1)),
  CONSTRAINT `chk_sl_dates` CHECK (`available_until_date` IS NULL OR `available_until_date` >= `available_from_date`),
  CONSTRAINT `chk_sl_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 29. supplier_lot_documents
CREATE TABLE IF NOT EXISTS `supplier_lot_documents` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_lot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `document_type` ENUM('LOT_PHOTO', 'QUALITY_REPORT', 'GI_CERTIFICATE', 'PACKING_LIST', 'OTHER') NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `detected_mime_type` VARCHAR(120) NOT NULL,
  `file_size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `scan_status` ENUM('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_ERROR') NOT NULL DEFAULT 'PENDING_SCAN',
  `uploaded_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sld_storage_key` (`storage_key`),
  KEY `idx_sld_lot` (`supplier_lot_id`),
  KEY `idx_sld_hash` (`sha256_hash`),
  KEY `idx_sld_uploaded_by` (`uploaded_by_user_id`),
  CONSTRAINT `fk_sld_lot` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sld_uploaded_by` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_sld_size` CHECK (`file_size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 30. supplier_lot_status_history
CREATE TABLE IF NOT EXISTS `supplier_lot_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_lot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `correlation_id` VARCHAR(100) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_slsh_lot_created` (`supplier_lot_id`, `created_at`),
  KEY `idx_slsh_actor` (`actor_user_id`),
  CONSTRAINT `fk_slsh_lot` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_slsh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 31. dealer_profiles
CREATE TABLE IF NOT EXISTS `dealer_profiles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealership_name` VARCHAR(180) NOT NULL,
  `dealership_slug` VARCHAR(200) NOT NULL,
  `legal_entity_name` VARCHAR(200) NULL,
  `gstin` VARCHAR(20) NULL,
  `city` VARCHAR(100) NOT NULL,
  `state_province` VARCHAR(100) NOT NULL,
  `country_code` CHAR(2) NOT NULL DEFAULT 'IN',
  `monthly_procurement_capacity` DECIMAL(14,2) NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `reliability_rating` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `profile_status` ENUM('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
  `verification_status` ENUM('UNVERIFIED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'UNVERIFIED',
  `approved_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dealer_profiles_user_id` (`user_id`),
  UNIQUE KEY `uq_dealer_profiles_slug` (`dealership_slug`),
  KEY `idx_dealer_profiles_status` (`profile_status`, `verification_status`),
  KEY `idx_dealer_profiles_city` (`city`, `state_province`),
  CONSTRAINT `fk_dealer_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dp_rating` CHECK (`reliability_rating` >= 0.00 AND `reliability_rating` <= 5.00),
  CONSTRAINT `chk_dp_capacity` CHECK (`monthly_procurement_capacity` IS NULL OR `monthly_procurement_capacity` >= 0.00),
  CONSTRAINT `chk_dp_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 32. dealer_documents
CREATE TABLE IF NOT EXISTS `dealer_documents` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `document_type` ENUM('BUSINESS_REGISTRATION', 'GST_CERTIFICATE', 'WAREHOUSE_LEASE', 'BANK_PROOF', 'IDENTITY_PROOF', 'OTHER') NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `detected_mime_type` VARCHAR(120) NOT NULL,
  `file_size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `scan_status` ENUM('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_ERROR') NOT NULL DEFAULT 'PENDING_SCAN',
  `verification_status` ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `uploaded_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dealer_docs_storage_key` (`storage_key`),
  KEY `idx_dealer_docs_dealer` (`dealer_profile_id`),
  KEY `idx_dealer_docs_hash` (`sha256_hash`),
  KEY `idx_dealer_docs_uploaded_by` (`uploaded_by_user_id`),
  CONSTRAINT `fk_dealer_docs_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dealer_docs_uploaded_by` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dealer_docs_size` CHECK (`file_size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 33. dealer_categories
CREATE TABLE IF NOT EXISTS `dealer_categories` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `is_approved` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dealer_category` (`dealer_profile_id`, `category_id`),
  KEY `idx_dc_category` (`category_id`),
  CONSTRAINT `fk_dc_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_dc_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dc_approved` CHECK (`is_approved` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 34. warehouses
CREATE TABLE IF NOT EXISTS `warehouses` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `owner_type` ENUM('SELLER', 'DEALER', 'PLATFORM') NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `address_line1` VARCHAR(255) NOT NULL,
  `address_line2` VARCHAR(255) NULL,
  `city` VARCHAR(100) NOT NULL,
  `state_province` VARCHAR(100) NOT NULL,
  `postal_code` VARCHAR(20) NOT NULL,
  `country_code` CHAR(2) NOT NULL DEFAULT 'IN',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_warehouses_code` (`warehouse_code`),
  KEY `idx_wh_seller` (`seller_profile_id`),
  KEY `idx_wh_dealer` (`dealer_profile_id`),
  KEY `idx_wh_active` (`is_active`, `owner_type`),
  CONSTRAINT `fk_wh_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_wh_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_wh_owner` CHECK (
    (`owner_type` = 'SELLER' AND `seller_profile_id` IS NOT NULL AND `dealer_profile_id` IS NULL)
    OR (`owner_type` = 'DEALER' AND `dealer_profile_id` IS NOT NULL AND `seller_profile_id` IS NULL)
    OR (`owner_type` = 'PLATFORM' AND `seller_profile_id` IS NULL AND `dealer_profile_id` IS NULL)
  ),
  CONSTRAINT `chk_wh_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 35. dealer_assignment_recommendations
CREATE TABLE IF NOT EXISTS `dealer_assignment_recommendations` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_lot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `rank_position` SMALLINT UNSIGNED NOT NULL,
  `match_score` DECIMAL(5,2) NOT NULL,
  `scoring_factors_json` JSON NULL,
  `generated_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dar_lot_dealer` (`supplier_lot_id`, `dealer_profile_id`),
  KEY `idx_dar_lot_rank` (`supplier_lot_id`, `rank_position`),
  KEY `idx_dar_dealer` (`dealer_profile_id`),
  KEY `idx_dar_generated_by` (`generated_by_user_id`),
  CONSTRAINT `fk_dar_lot` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dar_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dar_generated_by` FOREIGN KEY (`generated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_dar_score` CHECK (`match_score` >= 0.00 AND `match_score` <= 100.00)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 36. dealer_assignments
-- Invitation only; never transfers ownership or adds inventory.
CREATE TABLE IF NOT EXISTS `dealer_assignments` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_lot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `recommendation_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `attempt_number` INT UNSIGNED NOT NULL DEFAULT 1,
  `assigned_quantity` DECIMAL(14,3) NOT NULL,
  `proposed_unit_price` DECIMAL(14,2) NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `assignment_status` ENUM('INVITED', 'ACCEPTED', 'DECLINED', 'TERMS_AGREED', 'EXPIRED', 'CANCELLED', 'PO_CREATED') NOT NULL DEFAULT 'INVITED',
  `active_invitation_guard` TINYINT(1) GENERATED ALWAYS AS (IF(`assignment_status` IN ('INVITED', 'ACCEPTED', 'TERMS_AGREED'), 1, NULL)) STORED,
  `assigned_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` DATETIME(6) NULL,
  `responded_at` DATETIME(6) NULL,
  `response_notes` TEXT NULL,
  `agreed_terms_json` JSON NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_da_lot_dealer_active` (`supplier_lot_id`, `dealer_profile_id`, `active_invitation_guard`),
  KEY `idx_da_dealer_status` (`dealer_profile_id`, `assignment_status`),
  KEY `idx_da_lot_status` (`supplier_lot_id`, `assignment_status`),
  KEY `idx_da_recommendation` (`recommendation_id`),
  KEY `idx_da_assigned_by` (`assigned_by_user_id`),
  CONSTRAINT `fk_da_lot` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_da_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_da_recommendation` FOREIGN KEY (`recommendation_id`) REFERENCES `dealer_assignment_recommendations` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_da_assigned_by` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_da_qty` CHECK (`assigned_quantity` > 0.000),
  CONSTRAINT `chk_da_price` CHECK (`proposed_unit_price` IS NULL OR `proposed_unit_price` > 0.00),
  CONSTRAINT `chk_da_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 37. dealer_assignment_history
CREATE TABLE IF NOT EXISTS `dealer_assignment_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_assignment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `notes` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_dah_assignment` (`dealer_assignment_id`, `created_at`),
  KEY `idx_dah_actor` (`actor_user_id`),
  CONSTRAINT `fk_dah_assignment` FOREIGN KEY (`dealer_assignment_id`) REFERENCES `dealer_assignments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dah_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 38. supplier_purchase_orders
-- Created ONLY after dealer accepts assignment & commercial terms are agreed.
CREATE TABLE IF NOT EXISTS `supplier_purchase_orders` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `po_number` VARCHAR(64) NOT NULL,
  `supplier_lot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_assignment_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `destination_warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `subtotal_amount` DECIMAL(14,2) NOT NULL,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `freight_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL,
  `payment_terms` VARCHAR(160) NULL,
  `payment_due_date` DATE NULL,
  `settlement_status` ENUM('UNPAID', 'PARTIALLY_SETTLED', 'SETTLED', 'DISPUTED') NOT NULL DEFAULT 'UNPAID',
  `po_status` ENUM('DRAFT', 'ISSUED', 'CONFIRMED_BY_SUPPLIER', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INSPECTED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `expected_delivery_date` DATE NULL,
  `created_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_spo_po_number` (`po_number`),
  UNIQUE KEY `uq_spo_assignment` (`dealer_assignment_id`),
  KEY `idx_spo_supplier_status` (`supplier_profile_id`, `po_status`),
  KEY `idx_spo_dealer_status` (`dealer_profile_id`, `po_status`),
  KEY `idx_spo_lot` (`supplier_lot_id`),
  KEY `idx_spo_warehouse` (`destination_warehouse_id`),
  KEY `idx_spo_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_spo_lot` FOREIGN KEY (`supplier_lot_id`) REFERENCES `supplier_lots` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spo_assignment` FOREIGN KEY (`dealer_assignment_id`) REFERENCES `dealer_assignments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spo_supplier` FOREIGN KEY (`supplier_profile_id`) REFERENCES `supplier_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spo_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spo_warehouse` FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spo_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_spo_amounts` CHECK (`subtotal_amount` >= 0.00 AND `tax_amount` >= 0.00 AND `freight_amount` >= 0.00 AND `total_amount` > 0.00),
  CONSTRAINT `chk_spo_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 39. supplier_purchase_order_status_history
CREATE TABLE IF NOT EXISTS `supplier_purchase_order_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_sposh_po` (`supplier_purchase_order_id`, `created_at`),
  KEY `idx_sposh_actor` (`actor_user_id`),
  CONSTRAINT `fk_sposh_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sposh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 40. supplier_purchase_order_items
CREATE TABLE IF NOT EXISTS `supplier_purchase_order_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `item_title_snapshot` VARCHAR(220) NOT NULL,
  `sku_snapshot` VARCHAR(100) NOT NULL,
  `ordered_quantity` DECIMAL(14,3) NOT NULL,
  `unit_of_measure` VARCHAR(32) NOT NULL DEFAULT 'PCS',
  `unit_cost` DECIMAL(14,2) NOT NULL,
  `tax_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_spoi_po` (`supplier_purchase_order_id`),
  KEY `idx_spoi_product` (`product_id`),
  KEY `idx_spoi_variant` (`product_variant_id`),
  CONSTRAINT `fk_spoi_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spoi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spoi_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_spoi_qty` CHECK (`ordered_quantity` > 0.000),
  CONSTRAINT `chk_spoi_cost` CHECK (`unit_cost` > 0.00 AND `tax_amount` >= 0.00 AND `line_total` > 0.00),
  CONSTRAINT `chk_spoi_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 41. goods_receipts
CREATE TABLE IF NOT EXISTS `goods_receipts` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `receipt_number` VARCHAR(64) NOT NULL,
  `supplier_purchase_order_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `warehouse_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `dealer_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `received_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `received_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `receipt_status` ENUM('RECEIVED_PENDING_INSPECTION', 'INSPECTED', 'POSTED_TO_INVENTORY', 'REJECTED') NOT NULL DEFAULT 'RECEIVED_PENDING_INSPECTION',
  `carrier_reference` VARCHAR(120) NULL,
  `notes` TEXT NULL,
  `posted_to_inventory_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gr_receipt_number` (`receipt_number`),
  KEY `idx_gr_po` (`supplier_purchase_order_id`),
  KEY `idx_gr_warehouse` (`warehouse_id`),
  KEY `idx_gr_dealer_status` (`dealer_profile_id`, `receipt_status`),
  KEY `idx_gr_received_by` (`received_by_user_id`),
  CONSTRAINT `fk_gr_po` FOREIGN KEY (`supplier_purchase_order_id`) REFERENCES `supplier_purchase_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gr_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gr_dealer` FOREIGN KEY (`dealer_profile_id`) REFERENCES `dealer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gr_received_by` FOREIGN KEY (`received_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 42. goods_receipt_items
CREATE TABLE IF NOT EXISTS `goods_receipt_items` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `goods_receipt_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `supplier_po_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `received_quantity` DECIMAL(14,3) NOT NULL,
  `accepted_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `rejected_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `damaged_quantity` DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  `inventory_posted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_gri_receipt` (`goods_receipt_id`),
  KEY `idx_gri_po_item` (`supplier_po_item_id`),
  KEY `idx_gri_product` (`product_id`),
  KEY `idx_gri_variant` (`product_variant_id`),
  CONSTRAINT `fk_gri_receipt` FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gri_po_item` FOREIGN KEY (`supplier_po_item_id`) REFERENCES `supplier_purchase_order_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gri_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gri_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_gri_quantities` CHECK (
    `received_quantity` >= 0.000
    AND `accepted_quantity` >= 0.000
    AND `rejected_quantity` >= 0.000
    AND `damaged_quantity` >= 0.000
    AND (`accepted_quantity` + `rejected_quantity` + `damaged_quantity`) <= `received_quantity`
  ),
  CONSTRAINT `chk_gri_posted` CHECK (`inventory_posted` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 43. quality_inspections
CREATE TABLE IF NOT EXISTS `quality_inspections` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `goods_receipt_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `goods_receipt_item_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `inspector_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `inspection_outcome` ENUM('PASSED', 'PARTIALLY_PASSED', 'FAILED') NOT NULL,
  `checklist_results_json` JSON NULL,
  `notes` TEXT NULL,
  `inspected_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_qi_receipt` (`goods_receipt_id`),
  KEY `idx_qi_receipt_item` (`goods_receipt_item_id`),
  KEY `idx_qi_inspector` (`inspector_user_id`),
  CONSTRAINT `fk_qi_receipt` FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_qi_receipt_item` FOREIGN KEY (`goods_receipt_item_id`) REFERENCES `goods_receipt_items` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_qi_inspector` FOREIGN KEY (`inspector_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
