-- =============================================================================
-- HunarLink MySQL 8.4 LTS Schema
-- File: sql/02_sellers_and_verification.sql
-- Module B (Part 1): Seller Profiles, Verification & GI Reference Records (5 tables)
-- Tables:
--   10. seller_profiles
--   11. seller_verification_applications
--   12. seller_documents
--   13. seller_verification_history
--   14. gi_reference_records
-- Note: Product-level GI claim tables (`product_gi_claims`, `gi_claim_documents`,
--       `gi_verification_runs`) follow in 03_catalog_and_gi_products.sql right
--       after `products` so every foreign key resolves in strict execution order.
-- Rules:
--   - Verification path (`GI` vs `NON_GI`) is separate from platform role.
--   - Seller verification is separate from product-level GI verification.
--   - Never seed fictional official GI reference records.
-- =============================================================================

USE `hunarlink`;

-- 10. seller_profiles
CREATE TABLE IF NOT EXISTS `seller_profiles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `store_name` VARCHAR(160) NOT NULL,
  `store_slug` VARCHAR(180) NOT NULL,
  `legal_business_name` VARCHAR(200) NULL,
  `business_type` ENUM('INDIVIDUAL_ARTISAN', 'PROPRIETORSHIP', 'PARTNERSHIP', 'COOPERATIVE', 'PRIVATE_LIMITED', 'LLP') NOT NULL DEFAULT 'INDIVIDUAL_ARTISAN',
  `craft_specialty` VARCHAR(160) NULL,
  `workshop_district` VARCHAR(100) NULL,
  `workshop_state` VARCHAR(100) NOT NULL DEFAULT 'Jammu & Kashmir',
  `tax_id_masked` VARCHAR(64) NULL,
  `gstin` VARCHAR(20) NULL,
  `verification_path` ENUM('GI', 'NON_GI') NOT NULL DEFAULT 'NON_GI',
  `profile_status` ENUM('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
  `verification_status` ENUM('UNVERIFIED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'UNVERIFIED',
  `claimed_gi_authorized_user_no` VARCHAR(120) NULL,
  `bio` TEXT NULL,
  `average_rating` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `total_reviews` INT UNSIGNED NOT NULL DEFAULT 0,
  `approved_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_seller_profiles_user_id` (`user_id`),
  UNIQUE KEY `uq_seller_profiles_slug` (`store_slug`),
  KEY `idx_seller_profiles_status` (`profile_status`, `verification_status`),
  KEY `idx_seller_profiles_path` (`verification_path`),
  CONSTRAINT `fk_seller_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_seller_profiles_rating` CHECK (`average_rating` >= 0.00 AND `average_rating` <= 5.00)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 11. seller_verification_applications
CREATE TABLE IF NOT EXISTS `seller_verification_applications` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_number` VARCHAR(64) NOT NULL,
  `verification_path` ENUM('GI', 'NON_GI') NOT NULL,
  `application_status` ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_MORE_INFO', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
  `claimed_gi_code` VARCHAR(120) NULL,
  `claimed_craft_cluster` VARCHAR(160) NULL,
  `submitted_metadata` JSON NULL,
  `submitted_at` DATETIME(6) NULL,
  `assigned_reviewer_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reviewed_at` DATETIME(6) NULL,
  `review_decision_notes` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sva_application_number` (`application_number`),
  KEY `idx_sva_seller_status` (`seller_profile_id`, `application_status`),
  KEY `idx_sva_path_status` (`verification_path`, `application_status`),
  KEY `idx_sva_assigned_reviewer` (`assigned_reviewer_user_id`),
  KEY `idx_sva_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_sva_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_sva_assigned_reviewer` FOREIGN KEY (`assigned_reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_sva_reviewed_by` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 12. seller_documents
-- Private object storage keys only; raw bytes live in private object storage.
CREATE TABLE IF NOT EXISTS `seller_documents` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `document_type` ENUM('IDENTITY_PROOF', 'BUSINESS_REGISTRATION', 'TAX_CERTIFICATE', 'GI_AUTHORIZED_USER_CERT', 'WORKSHOP_PROOF', 'ARTISAN_PORTRAIT', 'BANK_PROOF', 'OTHER') NOT NULL,
  `storage_key` VARCHAR(512) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `detected_mime_type` VARCHAR(120) NOT NULL,
  `file_size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `scan_status` ENUM('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_ERROR') NOT NULL DEFAULT 'PENDING_SCAN',
  `verification_status` ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `uploaded_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reviewed_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `review_notes` VARCHAR(500) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_seller_documents_storage_key` (`storage_key`),
  KEY `idx_seller_docs_seller` (`seller_profile_id`, `document_type`),
  KEY `idx_seller_docs_app` (`application_id`),
  KEY `idx_seller_docs_hash` (`sha256_hash`),
  KEY `idx_seller_docs_uploaded_by` (`uploaded_by_user_id`),
  KEY `idx_seller_docs_reviewed_by` (`reviewed_by_user_id`),
  CONSTRAINT `fk_seller_docs_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_seller_docs_app` FOREIGN KEY (`application_id`) REFERENCES `seller_verification_applications` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_seller_docs_uploaded_by` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_seller_docs_reviewed_by` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_seller_docs_size` CHECK (`file_size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 13. seller_verification_history
CREATE TABLE IF NOT EXISTS `seller_verification_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `seller_profile_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_status` VARCHAR(40) NULL,
  `to_status` VARCHAR(40) NOT NULL,
  `actor_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `reason` VARCHAR(1000) NULL,
  `correlation_id` VARCHAR(100) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_svh_app_created` (`application_id`, `created_at`),
  KEY `idx_svh_seller` (`seller_profile_id`),
  KEY `idx_svh_actor` (`actor_user_id`),
  CONSTRAINT `fk_svh_app` FOREIGN KEY (`application_id`) REFERENCES `seller_verification_applications` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_svh_seller` FOREIGN KEY (`seller_profile_id`) REFERENCES `seller_profiles` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_svh_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 14. gi_reference_records
-- Stores verified, versioned official GI registry reference records imported
-- from trusted official sources. Never seed fictional registry entries.
CREATE TABLE IF NOT EXISTS `gi_reference_records` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `gi_registration_number` VARCHAR(100) NOT NULL,
  `gi_name` VARCHAR(255) NOT NULL,
  `craft_class` VARCHAR(120) NULL,
  `authorized_geographic_area` VARCHAR(255) NOT NULL,
  `state_region` VARCHAR(120) NOT NULL,
  `source_authority` VARCHAR(255) NOT NULL,
  `source_url` VARCHAR(512) NULL,
  `dataset_version` VARCHAR(64) NOT NULL,
  `reference_payload` JSON NULL,
  `valid_from` DATE NULL,
  `valid_until` DATE NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `imported_by_user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gi_ref_number_version` (`gi_registration_number`, `dataset_version`),
  KEY `idx_gi_ref_active_region` (`is_active`, `state_region`),
  KEY `idx_gi_ref_imported_by` (`imported_by_user_id`),
  CONSTRAINT `fk_gi_ref_imported_by` FOREIGN KEY (`imported_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_gi_ref_active` CHECK (`is_active` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
