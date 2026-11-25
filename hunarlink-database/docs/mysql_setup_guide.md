# HunarLink — MySQL 8.4 LTS Setup, Workbench, Backup & Restore Guide

## 1. Prerequisites
- **MySQL Server 8.0.21+** (**MySQL 8.4 LTS** preferred)
- Confirm version before running anything:
  ```bash
  mysql --version
  ```
- Confirm target database is empty (or take a backup first—never overwrite live data!).

---

## 2. Fresh Local Installation (Command Line)

### Single-File Install (Fastest)
```bash
cd hunarlink-database
mysql -u root -p < hunarlink_mysql_full_install.sql
mysql -u root -p < sql/11_validation_queries.sql
```

### Modular Install (Step-by-Step)
```bash
cd hunarlink-database
for f in \
  sql/00_create_database.sql \
  sql/01_identity_and_admin_access.sql \
  sql/02_sellers_and_verification.sql \
  sql/03_catalog_and_gi_products.sql \
  sql/04_suppliers_dealers_and_procurement.sql \
  sql/05_inventory_and_retail.sql \
  sql/06_wholesale_marketplace.sql \
  sql/07_payments_shipping_returns_reviews.sql \
  sql/08_promotions_notifications_and_admin_operations.sql \
  sql/09_mysql_indexes_triggers_views_procedures.sql \
  sql/10_seed_reference_data.sql \
  sql/11_validation_queries.sql; do
  echo "Running $f..."
  mysql -u root -p < "$f" || break
done
```

### Windows PowerShell
```powershell
cd hunarlink-database
Get-Content hunarlink_mysql_full_install.sql | mysql -u root -p
Get-Content sql\11_validation_queries.sql | mysql -u root -p
```

---

## 3. Installation in MySQL Workbench
1. Open **MySQL Workbench** and connect to your local **MySQL 8.4 LTS** instance.
2. Go to **File → Open SQL Script…** and select `hunarlink-database/hunarlink_mysql_full_install.sql`.
3. Click the **Execute (Lightning Bolt)** icon (NOT "Execute Current Statement") so Workbench preserves the `DELIMITER //` directives used by triggers and stored procedures.
4. Open `sql/11_validation_queries.sql` and run it to confirm **95 base tables**, **0 non-InnoDB tables**, **6 views**, **6 triggers**, **4 procedures**, and **0 fake user/admin/GI rows**.

---

## 4. Create Least-Privilege Database Users (After Editing Passwords!)
1. Copy `sql/12_create_database_users.example.sql` to a private file outside Git.
2. Replace every `REPLACE_WITH_STRONG_*_PASSWORD` placeholder with a 24+ character random password.
3. Run the edited script as `root` or an admin DBA account.
4. Configure `backend/.env` (gitignored) to use `hunarlink_app`, never `root`.

---

## 5. Disposable Development Smoke Test (13 Transactions)
Only on a **disposable development database**:
```bash
mysql -u root -p < sql/13_disposable_smoke_test.sql
```
Expected last row: `ALL 13 SMOKE TEST STEPS PASSED AND ROLLED BACK CLEANLY`.

---

## 6. Backup & Restore Runbook

### Logical Backup (`mysqldump` — Online InnoDB Safe)
```bash
mkdir -p backups
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 \
  -u hunarlink_migrator -p \
  hunarlink | gzip > "backups/hunarlink_$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

### Restore Backup (Into a Clean Verification or Recovery Database)
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS hunarlink_restore DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
gunzip -c backups/hunarlink_YYYYMMDDTHHMMSSZ.sql.gz | mysql -u root -p hunarlink_restore
mysql -u root -p hunarlink_restore < sql/11_validation_queries.sql
```
Always test restores periodically into a separate database (`hunarlink_restore`) before trusting a backup.
