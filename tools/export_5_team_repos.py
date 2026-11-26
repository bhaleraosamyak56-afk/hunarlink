#!/usr/bin/env python3
"""
HunarLink — 5-Member Rubric Package Exporter (`tools/export_5_team_repos.py`).

Partitions 100% of tracked git files in this repository into 5 strictly disjoint
folders (one per team member, aligned with the Ananta Round 3 Rubric) so you can
hand each teammate their exact folder to commit & push from their own GitHub
account into the Team Lead's unified repository with ZERO merge conflicts and
ZERO missing or altered files.

Usage:
    python3 tools/export_5_team_repos.py
    python3 tools/export_5_team_repos.py --out ../hunarlink-5-team-packages
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def classify_file(rel_path: str) -> str:
    """Assign every tracked file in the repo to exactly 1 of the 5 team packages."""
    # 1. SAMYAK (You): Frontend SPA + HunarSathi LLM + Backend AI / CraftProof / Demand Bridge
    if (
        rel_path.startswith("app/")
        or rel_path.startswith("assets/")
        or rel_path.startswith("brand/")
        or rel_path.startswith("fonts/")
        or rel_path.startswith("img/")
        or rel_path in {"index.html", "404.html", "category.html", "site.webmanifest", "sync-build.ps1"}
        or rel_path.startswith("hunarsathi-chatbot/")
        or rel_path.startswith("backend/app/modules/ai/")
        or rel_path.startswith("backend/app/modules/craftproof/")
        or rel_path.startswith("backend/app/modules/demand_bridge/")
        or rel_path == "backend/tests/test_craftproof_ai_demand_bridge.py"
    ):
        return "01_samyak_frontend_and_llm"

    # 2. MEMBER 2: Database Architecture, MySQL 8 DDL, ORM Models, Migrations & Seed Scripts
    if (
        rel_path.startswith("hunarlink-database/")
        or rel_path.startswith("backend/app/models/")
        or rel_path.startswith("backend/alembic/")
        or rel_path == "backend/alembic.ini"
        or rel_path.startswith("backend/scripts/")
    ):
        return "02_member2_database_and_models"

    # 3. MEMBER 3 (Team Lead): Backend Core, Storefront API & Razorpay Payments
    if (
        rel_path in {
            ".gitignore",
            "backend/.env.example",
            "backend/requirements.txt",
            "backend/pytest.ini",
            "backend/app/__init__.py",
            "backend/app/main.py",
            "backend/app/modules/__init__.py",
            "backend/app/core/__init__.py",
            "backend/app/core/config.py",
            "backend/app/core/database.py",
            "backend/app/core/audit.py",
            "backend/tests/__init__.py",
            "backend/tests/conftest.py",
            "backend/tests/test_razorpay_payments.py",
            "backend/tests/test_storefront_integration.py",
        }
        or rel_path.startswith("backend/app/modules/storefront/")
        or rel_path.startswith("backend/app/modules/payments/")
        or rel_path.startswith("backend/app/integrations/")
        or rel_path.startswith("backend/docs/payments/")
    ):
        return "03_member3_backend_and_payments"

    # 4. MEMBER 4: Authentication, Clerk RS256 JWKS, Admin PBKDF2 Security & RBAC
    if (
        rel_path in {
            "backend/app/core/auth.py",
            "backend/app/core/admin_security.py",
            "backend/tests/test_auth_sync.py",
        }
        or rel_path.startswith("backend/app/modules/auth/")
    ):
        return "04_member4_auth_and_rbac"

    # 5. MEMBER 5: 10-Layer ASIGS Guardrails, Infrastructure Security, Postman/OpenAPI & Docs
    return "05_member5_guardrails_security_and_docs"


PACKAGE_INSTRUCTIONS = {
    "01_samyak_frontend_and_llm": (
        "Samyak — Frontend SPA + HunarSathi Chatbot + Backend AI Copilot & CraftProof",
        "feat/frontend-and-llm-ai",
        [
            ("app brand fonts img site.webmanifest sync-build.ps1", "feat(frontend): build React 18 + Vite storefront, portals, and state store"),
            ("hunarsathi-chatbot", "feat(llm-chatbot): add HunarSathi streaming Gemini Flash assistant with fallback"),
            ("backend", "feat(llm-backend): add AI Copilot, OCR doc pre-screener, CraftProof QR Passports, and Demand Bridge"),
            ("index.html 404.html category.html assets", "build(frontend): compile lazy-loaded production chunks and SPA shell"),
        ],
    ),
    "02_member2_database_and_models": (
        "Member 2 — MySQL 8 Schema, SQLAlchemy 2.x ORM Models, Migrations & Seed Data",
        "feat/mysql-database-and-models",
        [
            ("hunarlink-database", "feat(database): add 95-table MySQL 8 DDL, triggers, views, and full installer"),
            ("backend/app/models", "feat(models): define SQLAlchemy 2.x ORM models for core, ASIGS, and CraftProof"),
            ("backend/alembic.ini backend/alembic backend/scripts", "feat(migrations): add Alembic chain 0001-0005 and authentic J&K catalog seed scripts"),
        ],
    ),
    "03_member3_backend_and_payments": (
        "Member 3 (Team Lead) — FastAPI Core, Storefront API & Razorpay Standard Checkout",
        "main",
        [
            (".gitignore backend/.env.example backend/requirements.txt backend/pytest.ini backend/app/__init__.py backend/app/core backend/app/modules/__init__.py", "feat(core): initialize monorepo and FastAPI config, DB session, and audit logger"),
            ("backend/app/modules/storefront backend/app/main.py", "feat(storefront): implement DB catalog, Seller Studio, Admin overview, and FastAPI app"),
            ("backend/app/integrations backend/app/modules/payments backend/docs backend/tests", "feat(payments): add Razorpay INR checkout, constant-time HMAC verify, webhooks, and tests"),
        ],
    ),
    "04_member4_auth_and_rbac": (
        "Member 4 — Clerk RS256 Authentication, Admin PBKDF2 Credentials & Artisan Card Staging",
        "feat/clerk-auth-and-rbac",
        [
            ("backend/app/core", "feat(auth): implement Clerk RS256 JWKS verifier and PBKDF2 admin credential hashing"),
            ("backend/app/modules/auth", "feat(auth-api): add user sync, duplicate gate, Artisan Card DB staging, and Admin login"),
            ("backend/tests", "test(auth): add integration tests for registration gate, RBAC, and Admin approval"),
        ],
    ),
    "05_member5_guardrails_security_and_docs": (
        "Member 5 — 10-Layer ASIGS Guardrails, WAF/Nginx Security, Postman Collection & Docs",
        "feat/guardrails-security-and-docs",
        [
            ("backend/app/core backend/app/modules/guardrails backend/docs", "feat(guardrails): implement 10-layer ASIGS counterfeit engine and private file security scan"),
            ("security tools backend/tests", "sec(qa): add WAF/Nginx/MySQL hardening configs, Playwright audit tools, and guardrail tests"),
            ("docs README.md backend/README.md", "docs(round3): add 72-endpoint Postman collection, OpenAPI 3.1 spec, and Judge Q&A guide"),
        ],
    ),
}


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Export 5 disjoint team member packages.")
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT.parent / "hunarlink-5-team-packages"),
        help="Output directory outside the git repo (default: ../hunarlink-5-team-packages)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out).resolve()
    if out_dir == REPO_ROOT or REPO_ROOT in out_dir.parents:
        print("ERROR: --out must be OUTSIDE the hunarlink git repository.", file=sys.stderr)
        return 1

    raw = subprocess.check_output(["git", "ls-files"], cwd=REPO_ROOT, text=True)
    tracked_files = [line.strip() for line in raw.splitlines() if line.strip()]

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {k: 0 for k in PACKAGE_INSTRUCTIONS}
    source_hashes: dict[str, str] = {}

    for rel in tracked_files:
        src = REPO_ROOT / rel
        if not src.is_file():
            continue
        pkg = classify_file(rel)
        counts[pkg] = counts.get(pkg, 0) + 1
        source_hashes[rel] = sha256_of(src)
        dst = out_dir / pkg / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    # Verify mathematically: union of all 5 packages == 100% of tracked files with zero overlap & identical SHA-256
    combined_dir = out_dir / "_verify_merged_union"
    seen_in_pkg: dict[str, str] = {}
    for pkg in sorted(PACKAGE_INSTRUCTIONS):
        pkg_root = out_dir / pkg
        for fpath in pkg_root.rglob("*"):
            if not fpath.is_file():
                continue
            rel = fpath.relative_to(pkg_root).as_posix()
            if rel in seen_in_pkg:
                raise RuntimeError(f"OVERLAP ERROR: {rel} in both {seen_in_pkg[rel]} and {pkg}")
            seen_in_pkg[rel] = pkg
            merged_dst = combined_dir / rel
            merged_dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(fpath, merged_dst)

    if set(seen_in_pkg.keys()) != set(source_hashes.keys()):
        missing = set(source_hashes.keys()) - set(seen_in_pkg.keys())
        extra = set(seen_in_pkg.keys()) - set(source_hashes.keys())
        raise RuntimeError(f"MISMATCH: missing={missing}, extra={extra}")

    for rel, expected_sha in source_hashes.items():
        actual_sha = sha256_of(combined_dir / rel)
        if actual_sha != expected_sha:
            raise RuntimeError(f"HASH MISMATCH on {rel}")

    shutil.rmtree(combined_dir)

    # Write a clear HOW_TO_MERGE_ALL_5.md right inside the output folder
    guide_lines = [
        "# How to Push & Merge All 5 Team Packages Into Team Lead's Main Repo",
        "",
        f"Verified **{len(source_hashes)} tracked files** split across **5 zero-overlap folders** (SHA-256 verified 100% identical when merged!).",
        "",
        "## Step 1 — Team Lead (`03_member3_backend_and_payments`) initializes the main repo first:",
        "```bash",
        "cd 03_member3_backend_and_payments",
        "git init -b main",
        'git config user.name "Team Lead Name"',
        'git config user.email "teamlead-github-email@example.com"',
        "git remote add origin https://github.com/<TEAM_LEAD>/hunarlink.git",
    ]
    for paths_str, msg in PACKAGE_INSTRUCTIONS["03_member3_backend_and_payments"][2]:
        guide_lines.append(f"git add {paths_str}")
        guide_lines.append(f'git commit -m "{msg}"')
    guide_lines += [
        "git push -u origin main",
        "```",
        "",
        "## Step 2 — The other 4 members (including Samyak) each push their folder from their own GitHub account:",
        "*(Team Lead invites all 4 members under GitHub Repo -> Settings -> Collaborators first!)*",
        "",
    ]

    for pkg in [
        "02_member2_database_and_models",
        "04_member4_auth_and_rbac",
        "01_samyak_frontend_and_llm",
        "05_member5_guardrails_security_and_docs",
    ]:
        title, branch, commits = PACKAGE_INSTRUCTIONS[pkg]
        guide_lines += [
            f"### `{pkg}` — {title} ({counts[pkg]} files)",
            "Send this ZIP/folder to this teammate. On their laptop:",
            "```bash",
            "git clone https://github.com/<TEAM_LEAD>/hunarlink.git",
            "cd hunarlink",
            'git config user.name "Teammate Real Name"',
            'git config user.email "teammate-github-verified-email@example.com"',
            f"git checkout -b {branch}",
            f"# Copy everything from {pkg}/ into this cloned hunarlink/ folder:",
            f"cp -a ../{pkg}/. .",
        ]
        for paths_str, msg in commits:
            guide_lines.append(f"git add {paths_str}")
            guide_lines.append(f'git commit -m "{msg}"')
        guide_lines += [
            f"git push -u origin {branch}",
            "```",
            f"Then open a Pull Request on GitHub (`{branch}` -> `main`) and click **Create a merge commit** (do NOT squash).",
            "",
        ]

    (out_dir / "HOW_TO_MERGE_ALL_5.md").write_text("\n".join(guide_lines), encoding="utf-8")

    print(f"SUCCESS: Exported and SHA-256 verified {len(source_hashes)} files into: {out_dir}")
    for pkg, count in counts.items():
        print(f"  - {pkg}: {count} files")
    print(f"  - Instructions written to: {out_dir / 'HOW_TO_MERGE_ALL_5.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
