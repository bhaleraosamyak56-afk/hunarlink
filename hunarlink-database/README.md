# HunarLink MySQL 8.4 LTS Database Package (`hunarlink-database/`)

Complete, modular, validated **MySQL 8.0.21+ / 8.4 LTS** database foundation for HunarLink's multi-vendor commerce platform covering:
1. **Retail Marketplace** (approved Direct Sellers → individual Customers, multi-seller fulfilment groups)
2. **Wholesale Marketplace** (approved Dealers → Wholesale Buyers, MOQ, price tiers, RFQs & quotations)
3. **Supplier-to-Dealer Procurement** (Supplier Lots → Admin Matching → Dealer Assignments → Purchase Orders → Goods Receipts → Quality Inspections → Dealer Inventory)
4. **GI & Non-GI Verification** (strict separation between GI LLM-assisted evidence assessment and Non-GI Admin manual review; seller approval separate from product GI status)
5. **Payments, Shipping, Returns, Reviews & Immutable Admin Operations**

## Package Inventory
- **95 base tables** (`ENGINE=InnoDB`, `utf8mb4`, `utf8mb4_0900_ai_ci`)
- **255 foreign keys** (zero circular or forward-reference errors, matching `CHAR(36) ascii_bin` UUIDs)
- **134 CHECK constraints** & **9 MySQL generated columns** for partial uniqueness
- **6 operational views**, **6 safety triggers**, and **4 caller-managed-transaction stored procedures**
- **Safe reference seed data only** (6 platform roles, 6 admin roles, 16 admin permissions, 6 craft categories, 5 non-secret platform settings — **zero fake users, admins, sellers, dealers, suppliers, or GI reference records**)

## Quick Fresh Install (Development Database Only)

### Option A — Single-File Installer (CLI)
```bash
mysql -u root -p < hunarlink_mysql_full_install.sql
mysql -u root -p < sql/11_validation_queries.sql
```

### Option B — Modular Execution Order
Run the scripts in exact numeric order (`00` → `11`):
1. `sql/00_create_database.sql`
2. `sql/01_identity_and_admin_access.sql`
3. `sql/02_sellers_and_verification.sql`
4. `sql/03_catalog_and_gi_products.sql`
5. `sql/04_suppliers_dealers_and_procurement.sql`
6. `sql/05_inventory_and_retail.sql`
7. `sql/06_wholesale_marketplace.sql`
8. `sql/07_payments_shipping_returns_reviews.sql`
9. `sql/08_promotions_notifications_and_admin_operations.sql`
10. `sql/09_mysql_indexes_triggers_views_procedures.sql`
11. `sql/10_seed_reference_data.sql`
12. `sql/11_validation_queries.sql`

> **Optional Security Setup:** Copy and edit placeholder passwords in `sql/12_create_database_users.example.sql` before running it. Never run example passwords as written.
>
> **Disposable Smoke Test:** Run `sql/13_disposable_smoke_test.sql` ONLY on a disposable development database to exercise all 13 transactional test cases (ends with `ROLLBACK`).

## Documentation Index
- [Database Architecture & ERD](docs/database_architecture.md)
- [Table Inventory (95 Tables)](docs/table_inventory.md)
- [Database Relationships](docs/database_relationships.md)
- [Complete Data Dictionary](docs/data_dictionary.md)
- [MySQL Setup, Workbench, Backup & Restore Guide](docs/mysql_setup_guide.md)
- [Validation Report](docs/mysql_validation_report.md)
- [FastAPI + SQLAlchemy 2.x + Alembic Integration](docs/fastapi_mysql_integration.md)
- [PostgreSQL-to-MySQL Migration Guide](docs/postgresql_to_mysql_migration.md)
