-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/03_catalog_and_gi_products.sql
-- Module B (Part 2) & Module C: Product Catalogue & Product GI Verification (9 tables)
-- Tables:
--   15. categories
--   16. brands
--   17. products
--   18. product_variants
--   19. product_images
--   20. product_gi_claims
--   21. gi_claim_documents
--   22. gi_verification_runs
--   23. seller_product_listings
-- Note: `dealer_wholesale_listings` is created in 06_wholesale_marketplace.sql
--       after `dealer_profiles`, `warehouses`, and `warehouse_stock` exist.
-- Rules:
--   - Shared product catalogue is separate from seller/dealer listings.
--   - Product GI status is separate from seller verification status.
--   - LLM verification run is an assessment only, never automatic legal proof.
-- =============================================================================

USE `hunarlink`;

-- 15. categories
CREATE TABLE IF NOT EXISTS `categories` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `parent_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(140) NOT NULL,
  `description` TEXT NULL,
  `is_gi_eligible_category` TINYINT(1) NOT NULL DEFAULT 0,
  `display_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_code` (`code`),
  UNIQUE KEY `uq_categories_slug` (`slug`),
  KEY `idx_categories_parent` (`parent_id`),
  KEY `idx_categories_active_order` (`is_active`, `display_order`),
  CONSTRAINT `fk_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_categories_gi_eligible` CHECK (`is_gi_eligible_category` IN (0, 1)),
  CONSTRAINT `chk_categories_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 16. brands
CREATE TABLE IF NOT EXISTS `brands` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(140) NOT NULL,
  `slug` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `origin_region` VARCHAR(120) NULL,
  `logo_storage_key` VARCHAR(512) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brands_slug` (`slug`),
  KEY `idx_brands_active` (`is_active`),
  CONSTRAINT `chk_brands_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 17. products
CREATE TABLE IF NOT EXISTS `products` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `category_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `brand_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `sku_root` VARCHAR(80) NOT NULL,
  `name` VARCHAR(220) NOT NULL,
  `slug` VARCHAR(240) NOT NULL,
  `short_description` VARCHAR(500) NULL,
  `description` MEDIUMTEXT NULL,
  `craft_technique` VARCHAR(120) NULL,
  `origin_district` VARCHAR(100) NULL,
  `material_composition` VARCHAR(255) NULL,
  `gi_status` ENUM('NOT_APPLICABLE', 'UNVERIFIED', 'PENDING_REVIEW', 'GI_VERIFIED', 'GI_REJECTED', 'GI_REVOKED') NOT NULL DEFAULT 'UNVERIFIED',
  `approval_status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `attributes_json` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_sku_root` (`sku_root`),
  UNIQUE KEY `uq_products_slug` (`slug`),
  KEY `idx_products_category` (`category_id`),
  KEY `idx_products_brand` (`brand_id`),
  KEY `idx_products_created_by` (`created_by_user_id`),
  KEY `idx_products_status` (`approval_status`, `gi_status`, `is_active`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_products_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_products_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_products_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 18. product_variants
CREATE TABLE IF NOT EXISTS `product_variants` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `variant_sku` VARCHAR(100) NOT NULL,
  `variant_name` VARCHAR(160) NOT NULL,
  `option_values_json` JSON NULL,
  `unit_of_measure` VARCHAR(32) NOT NULL DEFAULT 'PCS',
  `weight_grams` DECIMAL(10,2) NULL,
  `dimensions_cm_json` JSON NULL,
  `base_mrp` DECIMAL(14,2) NOT NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_variants_sku` (`variant_sku`),
  KEY `idx_product_variants_product` (`product_id`, `is_active`),
  CONSTRAINT `fk_product_variants_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_pv_mrp` CHECK (`base_mrp` > 0.00),
  CONSTRAINT `chk_pv_weight` CHECK (`weight_grams` IS NULL OR `weight_grams` >= 0.00),
  CONSTRAINT `chk_pv_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3),
  CONSTRAINT `chk_pv_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 19. product_images
CREATE TABLE IF NOT EXISTS `product_images` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `alt_text` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `primary_image_guard` TINYINT(1) GENERATED ALWAYS AS (IF(`is_primary` = 1, 1, NULL)) STORED,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_images_primary` (`product_id`, `primary_image_guard`),
  KEY `idx_product_images_product` (`product_id`, `sort_order`),
  KEY `idx_product_images_variant` (`product_variant_id`),
  CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_product_images_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_product_images_primary` CHECK (`is_primary` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 20. product_gi_claims
-- Separate from seller verification: approving a GI seller NEVER auto-verifies
-- every product of that seller.
CREATE TABLE IF NOT EXISTS `product_gi_claims` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `gi_reference_record_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `claimed_gi_code` VARCHAR(120) NOT NULL,
  `claimed_origin_location` VARCHAR(200) NOT NULL,
  `claim_statement` TEXT NULL,
  `claim_status` ENUM('DRAFT', 'SUBMITTED', 'ASSESSED_NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'DRAFT',
  `reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reviewed_at` DATETIME(6) NULL,
  `review_notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_pgc_product_status` (`product_id`, `claim_status`),
  KEY `idx_pgc_seller` (`seller_profile_id`),
  KEY `idx_pgc_reference` (`gi_reference_record_id`),
  KEY `idx_pgc_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_pgc_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pgc_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_pgc_reference` FOREIGN KEY (`gi_reference_record_id`) REFERENCES `gi_reference_records` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_pgc_reviewed_by` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 21. gi_claim_documents
CREATE TABLE IF NOT EXISTS `gi_claim_documents` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_gi_claim_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `document_type` ENUM('GI_TAG_PHOTO', 'LAB_PURITY_REPORT', 'ORIGIN_CERTIFICATE', 'WORKSHOP_LOOM_PROOF', 'OTHER') NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `detected_mime_type` VARCHAR(120) NOT NULL,
  `file_size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `scan_status` ENUM('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_ERROR') NOT NULL DEFAULT 'PENDING_SCAN',
  `uploaded_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gi_claim_docs_storage_key` (`storage_key`),
  KEY `idx_gcd_claim` (`product_gi_claim_id`),
  KEY `idx_gcd_hash` (`sha256_hash`),
  KEY `idx_gcd_uploaded_by` (`uploaded_by_user_id`),
  CONSTRAINT `fk_gcd_claim` FOREIGN KEY (`product_gi_claim_id`) REFERENCES `product_gi_claims` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gcd_uploaded_by` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_gcd_size` CHECK (`file_size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 22. gi_verification_runs
-- Traceable evidence assessment record for GI claims ONLY (never NON_GI).
-- `is_legal_proof` is constrained to 0 so an LLM run is never treated as legal proof.
CREATE TABLE IF NOT EXISTS `gi_verification_runs` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `target_type` ENUM('SELLER_APPLICATION', 'PRODUCT_GI_CLAIM') NOT NULL,
  `seller_application_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `product_gi_claim_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `gi_reference_record_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `provider_name` VARCHAR(80) NOT NULL,
  `model_version` VARCHAR(120) NOT NULL,
  `prompt_version` VARCHAR(64) NOT NULL,
  `dataset_version` VARCHAR(64) NOT NULL,
  `input_sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `evidence_reference_ids` JSON NOT NULL,
  `assessment_outcome` ENUM('LIKELY_MATCH', 'NEEDS_HUMAN_REVIEW', 'CONFLICT_DETECTED', 'INSUFFICIENT_EVIDENCE', 'ERROR') NOT NULL,
  `confidence_score` DECIMAL(5,2) NULL,
  `structured_findings_json` JSON NOT NULL,
  `is_legal_proof` TINYINT(1) NOT NULL DEFAULT 0,
  `is_mock_provider` TINYINT(1) NOT NULL DEFAULT 0,
  `human_review_decision` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED') NOT NULL DEFAULT 'PENDING',
  `human_reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `human_reviewed_at` DATETIME(6) NULL,
  `human_review_notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_gvr_seller_app` (`seller_application_id`),
  KEY `idx_gvr_product_claim` (`product_gi_claim_id`),
  KEY `idx_gvr_reference` (`gi_reference_record_id`),
  KEY `idx_gvr_review_status` (`human_review_decision`, `created_at`),
  KEY `idx_gvr_reviewer` (`human_reviewed_by_user_id`),
  CONSTRAINT `fk_gvr_seller_app` FOREIGN KEY (`seller_application_id`) REFERENCES `seller_verification_applications` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gvr_product_claim` FOREIGN KEY (`product_gi_claim_id`) REFERENCES `product_gi_claims` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_gvr_reference` FOREIGN KEY (`gi_reference_record_id`) REFERENCES `gi_reference_records` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_gvr_reviewer` FOREIGN KEY (`human_reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_gvr_not_legal_proof` CHECK (`is_legal_proof` = 0),
  CONSTRAINT `chk_gvr_is_mock` CHECK (`is_mock_provider` IN (0, 1)),
  CONSTRAINT `chk_gvr_confidence` CHECK (`confidence_score` IS NULL OR (`confidence_score` >= 0.00 AND `confidence_score` <= 100.00)),
  CONSTRAINT `chk_gvr_single_target` CHECK (
    (`target_type` = 'SELLER_APPLICATION' AND `seller_application_id` IS NOT NULL AND `product_gi_claim_id` IS NULL)
    OR (`target_type` = 'PRODUCT_GI_CLAIM' AND `product_gi_claim_id` IS NOT NULL AND `seller_application_id` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 23. seller_product_listings
-- Retail offers published by approved Direct Sellers against shared catalogue variants.
CREATE TABLE IF NOT EXISTS `seller_product_listings` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_variant_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_sku` VARCHAR(100) NOT NULL,
  `listing_title` VARCHAR(220) NOT NULL,
  `selling_price` DECIMAL(14,2) NOT NULL,
  `compare_at_mrp` DECIMAL(14,2) NULL,
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `min_order_qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `max_order_qty` INT UNSIGNED NULL,
  `dispatch_lead_days` SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  `listing_status` ENUM('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `published_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_spl_seller_sku` (`seller_profile_id`, `seller_sku`),
  KEY `idx_spl_product_status` (`product_id`, `listing_status`),
  KEY `idx_spl_variant_status` (`product_variant_id`, `listing_status`),
  KEY `idx_spl_seller_status` (`seller_profile_id`, `listing_status`),
  CONSTRAINT `fk_spl_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spl_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_spl_variant` FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_spl_price` CHECK (`selling_price` > 0.00),
  CONSTRAINT `chk_spl_mrp` CHECK (`compare_at_mrp` IS NULL OR `compare_at_mrp` >= `selling_price`),
  CONSTRAINT `chk_spl_qty` CHECK (`min_order_qty` >= 1 AND (`max_order_qty` IS NULL OR `max_order_qty` >= `min_order_qty`)),
  CONSTRAINT `chk_spl_currency` CHECK (CHAR_LENGTH(`currency_code`) = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
