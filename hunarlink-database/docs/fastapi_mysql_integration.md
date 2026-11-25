# FastAPI + SQLAlchemy 2.x + Alembic MySQL Integration Guide

## 1. Driver & Connection Strategy
HunarLink's new FastAPI backend (`backend/`) uses **synchronous SQLAlchemy 2.x + PyMySQL + Alembic** as specified in Section 8:

```bash
pip install sqlalchemy pymysql alembic
```

### Safe Connection URL Construction
Never concatenate raw passwords into a URL string if the password contains `@`, `#`, `:`, `%`, or `/`. `backend/app/core/config.py` uses `sqlalchemy.engine.URL.create()`:

```python
from sqlalchemy.engine import URL

url = URL.create(
    drivername="mysql+pymysql",
    username=settings.mysql_user,
    password=settings.mysql_password,
    host=settings.mysql_host,
    port=settings.mysql_port,
    database=settings.mysql_database,
    query={"charset": "utf8mb4"},
)
```

---

## 2. Exact Type Mapping Rules (`backend/app/models/`)
| MySQL Column Type | SQLAlchemy 2.x Type | Python Type | Notes |
|---|---|---|---|
| `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin` | `UUIDChar` (`TypeDecorator` / `CHAR(36)`) | `str` (canonical UUIDv4) | Generated via `str(uuid.uuid4())` |
| `DECIMAL(14,2)` / `DECIMAL(14,3)` | `Numeric(14, 2)` / `Numeric(14, 3)` | `decimal.Decimal` | Never `float`! Converted to integer paise for Razorpay |
| `DATETIME(6)` | `DateTime(timezone=False)` / `DATETIME(fsp=6)` | UTC `datetime` | Normalized to UTC before persistence |
| `TINYINT(1)` | `Boolean` (`TINYINT(1)`) | `bool` | Stored as `0` or `1` |
| `JSON` | `JSON` | `dict` / `list` | Native MySQL JSON, never `JSONB` |
| `GENERATED ALWAYS AS (...) STORED` | `Computed(..., persisted=True)` | Read-only | Never written by INSERT/UPDATE |

---

## 3. Alembic Workflow (Avoiding Duplicate Tables)
Because `hunarlink_mysql_full_install.sql` bootstraps the 95 baseline tables directly:
1. Run `hunarlink_mysql_full_install.sql` on a fresh MySQL database.
2. Stamp the baseline revision so Alembic knows the 95 baseline tables already exist:
   ```bash
   cd backend
   alembic stamp 0001_hunarlink_mysql_baseline
   ```
3. Apply incremental migrations (starting with `0002_add_asigs_guardrail_tables` which adds the 6 ASIGS Seller Guardrail tables):
   ```bash
   alembic upgrade head
   ```
4. Preview SQL offline before touching staging or production:
   ```bash
   alembic upgrade 0001_hunarlink_mysql_baseline:head --sql
   ```
5. **Never** run historical PostgreSQL migrations against MySQL, and **always** take a `mysqldump` backup before migrating production.

---

## 4. Handling Frontend UUID Transition
Notice that the offline prototype adapter (`app/src/data/adminDemo.js`) used numeric mock IDs (`user_id: 1001`, `lot_id: 1`). The real FastAPI backend serializes all IDs as canonical 36-character UUID strings (`"550e8400-e29b-41d4-a716-446655440000"`). All `/api/v1/...` path parameters accept UUID strings.
