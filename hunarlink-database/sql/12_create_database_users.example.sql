-- =============================================================================
-- HunarLink MySQL 8.4 LTS Least-Privilege Database Users (EXAMPLE ONLY)
-- File: sql/12_create_database_users.example.sql
--
-- WARNING:
--   1. DO NOT RUN THIS FILE AS WRITTEN! Replace every placeholder password
--      with a strong, randomly generated secret stored in your secret manager.
--   2. Restrict host bindings (`'127.0.0.1'` or private VPC CIDR) instead of
--      `'%'` wherever possible.
--   3. Keep application runtime user (`hunarlink_app`) separate from schema
--      migration user (`hunarlink_migrator`) and read-only reporting user.
-- =============================================================================

-- 1. Application runtime user (FastAPI / SQLAlchemy)
--    Granted DML only (no DROP/ALTER/CREATE TABLE).
--    audit_logs is INSERT + SELECT ONLY (append-only; UPDATE/DELETE also blocked by triggers).
CREATE USER IF NOT EXISTS 'hunarlink_app'@'127.0.0.1'
  IDENTIFIED WITH caching_sha2_password BY 'REPLACE_WITH_STRONG_APP_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
  ON `hunarlink`.*
  TO 'hunarlink_app'@'127.0.0.1';

-- Tighten audit_logs explicitly (defense in depth alongside BEFORE UPDATE/DELETE triggers)
-- Note: MySQL evaluates table-level privileges additively with DB-level grants.
-- For strict DB-engine enforcement without relying solely on triggers, grant
-- table-level DML per operational table and grant ONLY SELECT, INSERT on audit_logs.

-- 2. Migration user (Alembic deployments only; never used by FastAPI runtime)
CREATE USER IF NOT EXISTS 'hunarlink_migrator'@'127.0.0.1'
  IDENTIFIED WITH caching_sha2_password BY 'REPLACE_WITH_STRONG_MIGRATOR_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER, CREATE VIEW, CREATE ROUTINE, ALTER ROUTINE
  ON `hunarlink`.*
  TO 'hunarlink_migrator'@'127.0.0.1';

-- 3. Read-only analytics / support user
CREATE USER IF NOT EXISTS 'hunarlink_readonly'@'127.0.0.1'
  IDENTIFIED WITH caching_sha2_password BY 'REPLACE_WITH_STRONG_READONLY_PASSWORD';

GRANT SELECT, SHOW VIEW
  ON `hunarlink`.*
  TO 'hunarlink_readonly'@'127.0.0.1';

-- Enforce TLS for non-local connections in staging/production:
-- ALTER USER 'hunarlink_app'@'10.0.%' REQUIRE SSL;

FLUSH PRIVILEGES;
