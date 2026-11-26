# HunarLink Redis Setup & Operations Guide (Windows & Local Development)

MySQL 8.0/8.4 LTS remains HunarLink's **primary source of truth** for all permanent business records (`users`, `seller_profiles`, `products`, `retail_orders`, `wholesale_orders`, `payments`, `audit_logs`, `guardrail_checks`, `craft_passports`).

Redis powers high-throughput read-through caching, distributed sliding-window rate limiting, single-flight cache stampede locks, short-TTL RBAC principal lookups, and immediate server-side Admin JWT (`jti`) session revocation — with automatic **15-second circuit-breaker fallback** to MySQL and in-process rate limiting whenever Redis is offline.

---

## 1. Installing & Starting Redis on Windows

Choose **one** of the three official Windows-compatible options below:

### Option A: WSL2 (Ubuntu) — Recommended on Windows 10/11
1. Open **PowerShell (Admin)** if WSL2 is not yet installed:
   ```powershell
   wsl --install -d Ubuntu
   ```
2. Inside your **Ubuntu WSL2** terminal:
   ```bash
   sudo apt update
   sudo apt install -y redis-server
   sudo service redis-server start
   redis-cli ping
   # Expected output: PONG
   ```
   *(WSL2 automatically forwards `127.0.0.1:6379` to Windows `localhost:6379`.)*

### Option B: Docker Desktop for Windows
```powershell
docker run -d --name hunarlink-redis -p 6379:6379 --restart unless-stopped redis:7-alpine
docker exec -it hunarlink-redis redis-cli ping
# Expected output: PONG
```

### Option C: Native Windows Service (Memurai Developer Edition)
1. Install **Memurai Developer** (Redis-compatible native Windows service):
   ```powershell
   winget install Memurai.MemuraiDeveloper
   ```
2. Verify the Windows service is listening on `127.0.0.1:6379`:
   ```powershell
   memurai-cli ping
   # Expected output: PONG
   ```

---

## 2. Backend Environment Variables (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` (gitignored — never commit secrets) and configure:

```env
# Enable or disable Redis integration (falls back cleanly when false or unreachable)
REDIS_ENABLED=true

# Optional full connection URL override (e.g. redis://:password@127.0.0.1:6379/0 or rediss://... for TLS)
REDIS_URL=

# Discrete host/port settings (used when REDIS_URL is blank)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_SSL=false

# Namespace prefix for all HunarLink keys + resilience tuning
REDIS_KEY_PREFIX=hl
REDIS_SOCKET_TIMEOUT_SECONDS=0.5
REDIS_CIRCUIT_COOLDOWN_SECONDS=15.0
```

Install backend Python dependencies inside your virtual environment:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

---

## 3. Verifying Live Connectivity

Start FastAPI:
```powershell
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Check `http://127.0.0.1:8000/readyz`:
```json
{
  "status": "ready",
  "database": "connected",
  "database_dialect": "mysql",
  "redis": "connected",
  "public_artisans": 53,
  "public_listings": 96
}
```
- When Redis is running: `"redis": "connected"`.
- If you stop Redis (`docker stop hunarlink-redis` or `sudo service redis-server stop`): `/readyz` continues returning `HTTP 200` (`"status": "ready"`, `"database": "connected"`, `"redis": "unavailable"`) while all APIs seamlessly serve directly from MySQL.

---

## 4. Redis Key Namespace, Data Structures, TTLs & Invalidation

All keys use `{REDIS_KEY_PREFIX}:` (`hl:` by default). Domain invalidation uses atomic `O(1)` version counters (`INCR hl:ver:{domain}`) instead of blocking `KEYS *` scans:

| Feature | Key Pattern | Type | Default TTL | Post-Commit Invalidation Trigger |
|---|---|---|---|---|
| Domain Version Counters | `hl:ver:{catalog\|artisans\|passports\|admin}` | `STRING` (int) | Persistent | Incremented atomically via `INCR` on writes |
| Public Catalog Lists | `hl:cache:catalog:v{ver}:list:{cat}:lim{n}` | `STRING` (JSON) | `300s` (±10%) | Listing publish, Admin moderation, Guardrail decision, Seller approval |
| Single Product Detail | `hl:cache:catalog:v{ver}:item:{id_or_slug}` | `STRING` (JSON) | `600s` (±10%) | Same as Catalog Lists + Admin CraftProof claim decision |
| Verified Artisans Directory | `hl:cache:artisans:v{ver}:list` | `STRING` (JSON) | `300s` (±10%) | Artisan verification submit/decision, Seller verify, Listing publish/moderate |
| Verified Artisan Profile | `hl:cache:artisans:v{ver}:detail:{id_or_slug}` | `STRING` (JSON) | `600s` (±10%) | Same as Artisans Directory *(unverified probes are never cached and always audited in MySQL)* |
| CraftProof Public Passport | `hl:cache:passports:v{ver}:code:{code}` | `STRING` (JSON) | `600s` (±10%) | Passport create/update, Seller claim/evidence add, AI audit event, Admin claim decision |
| Product -> Passport Alias | `hl:cache:passports:v{ver}:prod_ref:{ref}` | `STRING` | `600s` (±10%) | Same as CraftProof Public Passport |
| Passport Lookup Search | `hl:cache:passports:v{ver}:lookup:{hash}:lim{n}` | `STRING` (JSON) | `180s` (±10%) | Same as CraftProof Public Passport |
| Passport SVG QR Code | `hl:cache:qr:v1:{code}:{base_hash}` | `STRING` (SVG) | `86,400s` (24h) | Deterministic per `passport_code` + `FRONTEND_BASE_URL` |
| RBAC Principal Cache | `hl:auth:principal:{clerk\|admin}:{id}` | `STRING` (JSON) | `45s` | `/auth/sync`, `/auth/artisan-verification`, Admin seller/app decisions, `/auth/admin-logout` |
| Admin JWT Revocation | `hl:auth:revoked_jti:{jti}` | `STRING` | Remaining JWT `exp` | Written on `POST /api/v1/auth/admin-logout` |
| Readiness & AI Probes | `hl:cache:readyz:v{ver}:counts`, `hl:cache:ai:status` | `STRING` (JSON) | `30s` | Bumped whenever `hl:ver:admin` increments |
| Admin Overview Snapshot | `hl:cache:admin:v{ver}:overview` | `STRING` (JSON) | `15s` | User sync, retail order creation, listing & seller mutations |
| Distributed Rate Limiter | `hl:rl:{scope}:{actor_or_ip}` | `ZSET` | `60s` | Sliding-window millisecond scores (`ZREMRANGEBYSCORE` + `ZCARD`) |
| Single-Flight Lock | `hl:lock:{sha1}` | `STRING` (`NX PX`) | `3s` (`3000ms`) | Released immediately by lock owner token after cache fill |

---

## 5. Running Automated Redis & Backend Tests

```powershell
cd backend
.\.venv\Scripts\pytest -v tests/test_redis_integration.py
.\.venv\Scripts\pytest -v
```
