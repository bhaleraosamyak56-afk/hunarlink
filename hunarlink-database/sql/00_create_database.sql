-- =============================================================================
-- HunarLink MySQL 8.4 LTS Database Bootstrap
-- File: sql/00_create_database.sql
-- Purpose: Create the `hunarlink` database with UTF-8 (utf8mb4) defaults.
-- Target: MySQL 8.0.21+ (MySQL 8.4 LTS preferred), InnoDB storage engine.
-- Safety: Fresh-install bootstrap only. Never run DROP DATABASE on live data.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `hunarlink`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `hunarlink`;

-- Enforce strict SQL validation during schema installation
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION time_zone = '+00:00';
