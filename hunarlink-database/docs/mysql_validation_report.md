# HunarLink MySQL 8.4 LTS — Validation & Verification Report

> **Strict Honesty Notice (Rule 13):** This sandbox container does **not** have a live `mysqld` / MySQL server binary installed. Therefore, this report clearly distinguishes between:
> 1. **Checks actually executed and PASSED in this environment** (full `sqlglot` MySQL-dialect AST parsing, schema/constraint/FK/type verification, SQLAlchemy 2.x metadata verification, and Alembic offline MySQL DDL generation).
> 2. **Live MySQL 8.4 LTS server checks** ready for you to execute on your local or staging MySQL 8.4 LTS server using `sql/11_validation_queries.sql` and `sql/13_disposable_smoke_test.sql`.

---

## 1. Automated Static MySQL 8.4 Verification (Executed & PASSED)
Command executed:
```bash
.venv/bin/python hunarlink-database/tools/validate_sql_static.py
```

| Verification Check | Expected | Observed Result | Status |
|---|---|---|---|
| Base table inventory (`sql/01`–`sql/08`) | Exactly 95 baseline tables | **95 / 95 exact match** (0 missing, 0 duplicates, 0 renames) | **PASS** |
| MySQL dialect parsing (`sqlglot`, `read="mysql"`) | Zero syntax errors | **0 parse errors** | **PASS** |
| InnoDB & `utf8mb4` check on all tables | 100% InnoDB + `utf8mb4_0900_ai_ci` | **95 / 95 InnoDB + utf8mb4** | **PASS** |
| Floating-point ban (`FLOAT` / `DOUBLE`) | 0 columns | **0 columns** | **PASS** |
| PostgreSQL syntax ban (`::`, `JSONB`, `TIMESTAMPTZ`, `SERIAL`, `ILIKE`, `ON CONFLICT`, `PL/pgSQL`) | 0 occurrences | **0 occurrences** | **PASS** |
| Foreign-key creation order & target resolution | 0 forward-reference errors | **255 / 255 FKs valid in strict order** | **PASS** |
| Foreign-key UUID type & `ascii_bin` collation match | 100% exact match | **255 / 255 exact match** | **PASS** |
| CHECK constraints defined | Positive prices, non-negative stock, single targets, `is_legal_proof = 0` | **134 CHECK constraints** | **PASS** |
| MySQL generated columns for partial uniqueness | Replaces PostgreSQL partial unique indexes | **9 generated columns** | **PASS** |
| Stored procedures free of `START TRANSACTION`/`COMMIT`/`ROLLBACK` | Caller owns transaction | **4 / 4 procedures caller-managed** | **PASS** |
| Safe seed data (0 fake users, admins, sellers, dealers, suppliers, GI refs) | 0 fake identities | **Verified clean** | **PASS** |
| Views, triggers & procedures present | 6 views, 6 triggers, 4 procedures | **6 views, 6 triggers, 4 procedures** | **PASS** |

---

## 2. Live MySQL 8.4 LTS Execution Checklist (Pending Live MySQL Server)
Run these commands on your disposable local **MySQL 8.4 LTS** instance and record the observed outputs:

```bash
mysql -u root -p < hunarlink-database/hunarlink_mysql_full_install.sql
mysql -u root -p < hunarlink-database/sql/11_validation_queries.sql
mysql -u root -p < hunarlink-database/sql/13_disposable_smoke_test.sql
```

- [ ] `mysql --version` confirms MySQL `8.0.21+` / `8.4 LTS`
- [ ] `hunarlink_mysql_full_install.sql` exits with code `0` and zero warnings/errors
- [ ] `sql/11_validation_queries.sql` returns `base_table_count = 95`, `0` non-InnoDB tables, `0` float/double columns, `6` views, `6` triggers, `4` procedures, `0` users/admins/GI refs
- [ ] `sql/13_disposable_smoke_test.sql` outputs `ALL 13 SMOKE TEST STEPS PASSED AND ROLLED BACK CLEANLY`
- [ ] Verify `UPDATE audit_logs ...` fails with `audit_logs is append-only; UPDATE is prohibited.`
- [ ] Verify inserting into `gi_verification_runs` for a `NON_GI` application fails with trigger error
- [ ] Verify `alembic stamp 0001_hunarlink_mysql_baseline` + `alembic upgrade head` adds the 6 ASIGS guardrail tables cleanly (`base_table_count = 101`)
