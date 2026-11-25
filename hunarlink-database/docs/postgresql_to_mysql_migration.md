# PostgreSQL-to-MySQL 8.4 LTS Migration Guide

> **Current Status:** Phase 0 inspection confirmed **no existing PostgreSQL database dump or migrations exist in this repository**. This guide documents the exact safe procedure if an upstream PostgreSQL HunarLink instance with real data needs to be migrated into MySQL 8.4 LTS.
>
> **Important:** Schema conversion and data migration are two separate tasks. Never declare data migration complete until real records are exported, imported, and reconciled row-by-row.

---

## 1. Type & Syntax Conversion Reference

| Legacy PostgreSQL Concept | HunarLink MySQL 8.4 LTS Equivalent |
|---|---|
| `UUID` | `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin` |
| `JSONB` | `JSON` |
| `TIMESTAMPTZ` | `DATETIME(6)` normalized to UTC (`+00:00`) |
| `BOOLEAN` | `TINYINT(1)` with `CHECK (col IN (0, 1))` |
| `NUMERIC(14,2)` | `DECIMAL(14,2)` |
| `SERIAL` / `BIGSERIAL` | UUID `CHAR(36)` (or `BIGINT UNSIGNED AUTO_INCREMENT` where integer) |
| Partial unique index (`CREATE UNIQUE INDEX ... WHERE ...`) | `GENERATED ALWAYS AS (IF(..., 1, NULL)) STORED` + `UNIQUE KEY` |
| `ILIKE` | `LIKE` under `utf8mb4_0900_ai_ci` (case-insensitive) or `FULLTEXT INDEX` |
| `ON CONFLICT DO UPDATE` | `ON DUPLICATE KEY UPDATE` |
| `PL/pgSQL` functions/triggers | MySQL `DELIMITER //` `CREATE TRIGGER` / `CREATE PROCEDURE` |

---

## 2. 12-Step Safe Data Migration Checklist (Only If Real PostgreSQL Data Exists)
1. **Freeze writes / maintenance window** and take a verified PostgreSQL backup (`pg_dump --format=custom`).
2. **Keep the original PostgreSQL database untouched** as the rollback source of truth.
3. Install the fresh MySQL 8.4 schema (`hunarlink_mysql_full_install.sql`) on the target MySQL server.
4. Temporarily pause only data-import conflict triggers if importing historical records in bulk (keep `audit_logs` insert-only; never disable validation permanently).
5. Export tables from PostgreSQL in **parent-before-child foreign-key order** (`01` → `08`).
6. Preserve every primary key UUID and foreign-key reference verbatim (lowercase canonical 36-char format).
7. Normalize all `TIMESTAMPTZ` fields explicitly to UTC (`AT TIME ZONE 'UTC'`).
8. Validate every `JSONB` payload parses as valid UTF-8 MySQL `JSON`.
9. Verify `DECIMAL` sums (orders, payments, refunds, stock totals) match to the exact paisa (`0.01`).
10. Compare row counts **table by table** across all 95 tables.
11. Run `sql/11_validation_queries.sql` to verify zero orphans, zero negative stock, and zero duplicate active defaults.
12. Test end-to-end FastAPI workflows against MySQL before switching `DATABASE_URL`; keep PostgreSQL read-only during the rollback window.
