-- =============================================================================
-- HunarLink MySQL 8.4 LTS Safe Reference Seed Data
-- File: sql/10_seed_reference_data.sql
-- Purpose: Insert ONLY safe platform reference data:
--   - 6 platform roles
--   - 6 admin roles
--   - 16 fine-grained admin permissions & role-permission mappings
--   - 6 core Kashmiri handicraft categories
--   - Non-secret default platform settings
--
-- STRICT SAFETY RULE:
--   DO NOT seed fake users, fake Super Admins, fake sellers, fake suppliers,
--   fake dealers, fake payment credentials, or fictional official GI reference
--   records. Provision the first Super Admin only after verifying a real Clerk
--   user identity.
-- =============================================================================

USE `hunarlink`;

-- -----------------------------------------------------------------------------
-- 1. Platform Roles (6 roles)
-- -----------------------------------------------------------------------------
INSERT INTO `platform_roles` (`id`, `code`, `name`, `description`, `is_active`) VALUES
  ('10000000-0000-4000-8000-000000000001', 'CUSTOMER',        'Customer',            'Individual retail buyer purchasing crafts from approved direct sellers.', 1),
  ('10000000-0000-4000-8000-000000000002', 'DIRECT_SELLER',   'Direct Seller',       'Approved artisan or workshop selling products directly to retail customers.', 1),
  ('10000000-0000-4000-8000-000000000003', 'SUPPLIER',        'Supplier / Producer', 'Producer or artisan cluster submitting supply lots for dealer procurement.', 1),
  ('10000000-0000-4000-8000-000000000004', 'DEALER',          'Dealer',              'Approved wholesale dealer procuring lots and fulfilling bulk B2B orders.', 1),
  ('10000000-0000-4000-8000-000000000005', 'WHOLESALE_BUYER', 'Wholesale Buyer',     'Verified B2B buyer purchasing bulk lots or requesting dealer quotations.', 1),
  ('10000000-0000-4000-8000-000000000006', 'ADMIN',           'Admin',               'Authorized platform operator with role-scoped administrative permissions.', 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

-- -----------------------------------------------------------------------------
-- 2. Admin Roles (6 roles)
-- -----------------------------------------------------------------------------
INSERT INTO `admin_roles` (`id`, `code`, `name`, `description`, `is_system_role`, `is_active`) VALUES
  ('20000000-0000-4000-8000-000000000001', 'SUPER_ADMIN',         'Super Administrator',  'Full administrative governance including RBAC, settings, and escalations.', 1, 1),
  ('20000000-0000-4000-8000-000000000002', 'GI_VERIFIER',         'GI & Craft Verifier',  'Reviews GI evidence runs, Non-GI seller applications, and product GI claims.', 1, 1),
  ('20000000-0000-4000-8000-000000000003', 'PROCUREMENT_MANAGER', 'Procurement Manager',  'Reviews supplier lots, ranks dealers, and oversees procurement workflow.', 1, 1),
  ('20000000-0000-4000-8000-000000000004', 'FINANCE_ADMIN',       'Finance Administrator','Monitors payments, reconciliation, refunds, and settlement ledgers.', 1, 1),
  ('20000000-0000-4000-8000-000000000005', 'CATALOG_MODERATOR',   'Catalogue Moderator',  'Approves products, seller listings, and guardrail review cases.', 1, 1),
  ('20000000-0000-4000-8000-000000000006', 'SUPPORT_LEAD',        'Support Lead',         'Handles customer/seller tickets and return escalations.', 1, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

-- -----------------------------------------------------------------------------
-- 3. Admin Permissions (16 fine-grained permissions)
-- -----------------------------------------------------------------------------
INSERT INTO `admin_permissions` (`id`, `code`, `module_name`, `description`, `is_high_risk`) VALUES
  ('30000000-0000-4000-8000-000000000001', 'users.read',           'identity',    'View user accounts and assigned platform roles.', 0),
  ('30000000-0000-4000-8000-000000000002', 'users.manage',         'identity',    'Suspend, reactivate, or update user role assignments.', 1),
  ('30000000-0000-4000-8000-000000000003', 'sellers.review',       'sellers',     'Review and decide Non-GI and GI seller onboarding applications.', 0),
  ('30000000-0000-4000-8000-000000000004', 'gi.review',            'gi',          'Review GI evidence assessments and approve/reject product GI claims.', 1),
  ('30000000-0000-4000-8000-000000000005', 'catalog.approve',      'catalog',     'Approve or reject products and seller/dealer listings.', 0),
  ('30000000-0000-4000-8000-000000000006', 'procurement.read',     'procurement', 'Inspect supplier lots, dealer assignments, POs, and receipts.', 0),
  ('30000000-0000-4000-8000-000000000007', 'procurement.manage',   'procurement', 'Approve supplier lots and assign suitable dealers.', 0),
  ('30000000-0000-4000-8000-000000000008', 'payments.read',        'payments',    'View payments, webhook events, and reconciliation records.', 0),
  ('30000000-0000-4000-8000-000000000009', 'payments.refund',      'payments',    'Initiate and approve full or partial customer payment refunds.', 1),
  ('30000000-0000-4000-8000-000000000010', 'payouts.manage',       'payments',    'Manage seller, dealer, and supplier settlement obligations.', 1),
  ('30000000-0000-4000-8000-000000000011', 'guardrails.read',      'guardrails',  'Inspect seller input guardrail checks and review cases.', 0),
  ('30000000-0000-4000-8000-000000000012', 'guardrails.decide',    'guardrails',  'Approve, reject, or override guardrail review cases with mandatory reason.', 1),
  ('30000000-0000-4000-8000-000000000013', 'support.manage',       'operations',  'Respond to support tickets and oversee returns.', 0),
  ('30000000-0000-4000-8000-000000000014', 'settings.manage',      'operations',  'Modify platform-wide operational settings.', 1),
  ('30000000-0000-4000-8000-000000000015', 'audit.read',           'operations',  'Read immutable audit logs and security histories.', 0),
  ('30000000-0000-4000-8000-000000000016', 'rbac.manage',          'identity',    'Assign or revoke Admin roles and permissions.', 1)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `is_high_risk` = VALUES(`is_high_risk`);

-- -----------------------------------------------------------------------------
-- 4. Admin Role -> Permission Mappings
-- -----------------------------------------------------------------------------
-- SUPER_ADMIN receives all 16 permissions
INSERT IGNORE INTO `admin_role_permissions` (`id`, `admin_role_id`, `admin_permission_id`)
SELECT
  CONCAT('40000000-0000-4000-8000-', LPAD(ROW_NUMBER() OVER (ORDER BY `code`), 12, '0')),
  '20000000-0000-4000-8000-000000000001',
  `id`
FROM `admin_permissions`;

-- Scoped role permissions
INSERT IGNORE INTO `admin_role_permissions` (`id`, `admin_role_id`, `admin_permission_id`) VALUES
  ('41000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003'),
  ('41000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004'),
  ('41000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000011'),
  ('41000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012'),
  ('41000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006'),
  ('41000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000007'),
  ('41000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000011'),
  ('41000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000008'),
  ('41000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000009'),
  ('41000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000010'),
  ('41000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000015'),
  ('41000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005'),
  ('41000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000011'),
  ('41000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000012'),
  ('41000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001'),
  ('41000000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000013');

-- -----------------------------------------------------------------------------
-- 5. Core Craft Categories (Reference Taxonomy Only)
-- -----------------------------------------------------------------------------
INSERT INTO `categories` (`id`, `parent_id`, `code`, `name`, `slug`, `description`, `is_gi_eligible_category`, `display_order`, `is_active`) VALUES
  ('50000000-0000-4000-8000-000000000001', NULL, 'PASHMINA',     'Pashmina & Kani Shawls', 'pashmina-kani-shawls', 'Hand-spun Kashmiri Pashmina, Kani Jamawar, and Sozni shawls.', 1, 1, 1),
  ('50000000-0000-4000-8000-000000000002', NULL, 'WALNUT_WOOD',  'Walnut Woodcarving',     'walnut-woodcarving',   'Seasoned Juglans Regia hand-carved furniture, screens, and decor.', 1, 2, 1),
  ('50000000-0000-4000-8000-000000000003', NULL, 'SILK_CARPETS', 'Hand-Knotted Carpets',   'hand-knotted-carpets', 'Kashmiri silk-on-silk and wool hand-knotted carpets.', 1, 3, 1),
  ('50000000-0000-4000-8000-000000000004', NULL, 'PAPIER_MACHE', 'Papier-Mache Art',       'papier-mache-art',     'Sakhta and Naqashi lacquered papier-mache craftwork.', 1, 4, 1),
  ('50000000-0000-4000-8000-000000000005', NULL, 'SOZNI',        'Sozni Embroidery',       'sozni-embroidery',     'Fine Kashmiri needlework textiles and stoles.', 1, 5, 1),
  ('50000000-0000-4000-8000-000000000006', NULL, 'COPPERWARE',   'Copperware & Crewels',   'copperware-crewels',   'Hand-engraved Kandkari copperware and traditional crewel textiles.', 0, 6, 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `is_active` = VALUES(`is_active`);

-- -----------------------------------------------------------------------------
-- 6. Safe Default Platform Settings (Non-Secret Operational Defaults)
-- -----------------------------------------------------------------------------
INSERT INTO `platform_settings` (`id`, `setting_key`, `setting_value_json`, `description`, `is_sensitive`, `is_active`) VALUES
  ('60000000-0000-4000-8000-000000000001', 'default_currency',                 JSON_OBJECT('currency', 'INR'),              'Default transaction currency for initial India release.', 0, 1),
  ('60000000-0000-4000-8000-000000000002', 'payment_capture_policy',           JSON_OBJECT('mode', 'AUTO_CAPTURE_REQUIRED'), 'Online fulfilment requires verified CAPTURED payment.', 0, 1),
  ('60000000-0000-4000-8000-000000000003', 'gi_llm_enabled',                   JSON_OBJECT('enabled', false),                'GI LLM assessment remains behind provider flag until official GI dataset is loaded.', 0, 1),
  ('60000000-0000-4000-8000-000000000004', 'cod_enabled',                      JSON_OBJECT('enabled', true),                 'Allow Cash on Delivery on eligible retail orders without creating Razorpay orders.', 0, 1),
  ('60000000-0000-4000-8000-000000000005', 'stock_reservation_ttl_minutes',    JSON_OBJECT('minutes', 15),                   'Default checkout reservation hold window in minutes.', 0, 1)
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`);
