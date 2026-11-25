-- =============================================================================
-- HunarLink MySQL 8.4 LTS Validation Queries
-- File: sql/11_validation_queries.sql
-- Purpose: Run read-only schema, constraint, engine, FK, trigger, view,
--          procedure, and reference-data integrity checks after installation.
-- =============================================================================

USE `hunarlink`;

-- 1. MySQL server version, active database, charset, and UTC time zone
SELECT
  VERSION() AS mysql_version,
  DATABASE() AS current_database,
  @@character_set_database AS db_charset,
  @@collation_database AS db_collation,
  @@session.time_zone AS session_tz;

-- 2. Expected base-table count (baseline = 95 business tables)
SELECT COUNT(*) AS base_table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE';

-- 3. Verify EVERY base table uses InnoDB and utf8mb4 (expected: 0 rows)
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE'
  AND (ENGINE <> 'InnoDB' OR TABLE_COLLATION NOT LIKE 'utf8mb4%');

-- 4. Verify ZERO FLOAT or DOUBLE columns exist anywhere in the schema (expected: 0 rows)
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND DATA_TYPE IN ('float', 'double');

-- 5. Foreign-key inventory summary
SELECT COUNT(*) AS total_foreign_keys
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

-- 6. CHECK constraint inventory summary (enforced on MySQL 8.0.16+)
SELECT COUNT(*) AS total_check_constraints
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_TYPE = 'CHECK';

-- 7. Unique constraints & indexes count
SELECT
  COUNT(DISTINCT CONCAT(TABLE_NAME, '.', INDEX_NAME)) AS total_indexes,
  COUNT(DISTINCT CASE WHEN NON_UNIQUE = 0 THEN CONCAT(TABLE_NAME, '.', INDEX_NAME) END) AS unique_or_pk_indexes
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE();

-- 8. Verify views exist and return rows cleanly (expected: 6 views)
SELECT TABLE_NAME AS view_name
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- 9. Verify triggers exist (expected: 6 triggers)
SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY TRIGGER_NAME;

-- 10. Verify stored procedures exist (expected: 4 procedures)
SELECT ROUTINE_NAME, ROUTINE_TYPE
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_NAME;

-- 11. Verify seeded reference data counts (and confirm ZERO fake users/admins/GI refs)
SELECT 'platform_roles'        AS table_name, COUNT(*) AS row_count FROM `platform_roles`
UNION ALL SELECT 'admin_roles',             COUNT(*) FROM `admin_roles`
UNION ALL SELECT 'admin_permissions',       COUNT(*) FROM `admin_permissions`
UNION ALL SELECT 'admin_role_permissions',  COUNT(*) FROM `admin_role_permissions`
UNION ALL SELECT 'categories',              COUNT(*) FROM `categories`
UNION ALL SELECT 'platform_settings',       COUNT(*) FROM `platform_settings`
UNION ALL SELECT 'users (must be 0)',       COUNT(*) FROM `users`
UNION ALL SELECT 'admin_profiles (must be 0)', COUNT(*) FROM `admin_profiles`
UNION ALL SELECT 'gi_reference_records (must be 0)', COUNT(*) FROM `gi_reference_records`;

-- 12. Data integrity sanity checks (expected: 0 rows for each)
-- 12a. Duplicate active role assignments
SELECT `user_id`, `platform_role_id`, COUNT(*) AS active_cnt
FROM `user_role_assignments`
WHERE `assignment_status` = 'ACTIVE'
GROUP BY `user_id`, `platform_role_id`
HAVING COUNT(*) > 1;

-- 12b. More than one active default address per user
SELECT `user_id`, COUNT(*) AS default_cnt
FROM `user_addresses`
WHERE `is_default` = 1 AND `is_active` = 1
GROUP BY `user_id`
HAVING COUNT(*) > 1;

-- 12c. Any negative stock balances
SELECT `id`, `available_quantity`, `reserved_quantity`, `damaged_quantity`
FROM `warehouse_stock`
WHERE `available_quantity` < 0 OR `reserved_quantity` < 0 OR `damaged_quantity` < 0;

-- 13. View smoke check (ensures every view compiles and executes)
SELECT COUNT(*) AS vw_active_user_roles_cnt          FROM `vw_active_user_roles`;
SELECT COUNT(*) AS vw_seller_verification_queue_cnt  FROM `vw_seller_verification_queue`;
SELECT COUNT(*) AS vw_product_gi_summary_cnt         FROM `vw_product_gi_summary`;
SELECT COUNT(*) AS vw_warehouse_stock_health_cnt     FROM `vw_warehouse_stock_health`;
SELECT COUNT(*) AS vw_dealer_procurement_pipeline_cnt FROM `vw_dealer_procurement_pipeline`;
SELECT COUNT(*) AS vw_payment_reconciliation_cnt     FROM `vw_payment_reconciliation_overview`;
