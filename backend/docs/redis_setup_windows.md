# HunarLink — Redis Removed (MySQL-Direct Mode)

Redis has been removed from HunarLink as of Nov 2026.

- **MySQL 8.x is the single source of truth** for all business records.
- All catalog/artisan/passport/readyz reads are **MySQL-direct** — Workbench `DELETE`/`UPDATE` + `COMMIT` reflects on next site refresh (`Ctrl+Shift+R`) with no cache delay.
- Rate limiting is **in-process** (per-worker). For production multi-worker, put a gateway limiter in front.
- Admin JWT revocation is **in-process** (per-worker).

No Redis setup needed. If your `backend/.env` still contains `REDIS_*` vars, they are ignored.

Previous guide archived — do not install Redis for HunarLink.
