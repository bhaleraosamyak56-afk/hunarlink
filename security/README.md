# HunarLink Infrastructure & Firewall Security Suite (Workstream 4 — Milestones 1–12)

> **Important Honesty & Safety Notice**
> - All server configs in this folder use `.example` suffixes because HunarLink's hosting provider, cloud VPC, and production domain have not yet been provisioned.
> - **None of these firewall or Nginx rules are active inside this Git repository or GitHub Pages.** They become active only when deployed onto your staging/production server(s) and verified non-destructively.
> - **SSH Anti-Lockout Rule:** Always allow SSH (`22/tcp` or your custom SSH port) and verify a second SSH login *before* enabling any host firewall (`ufw enable`).

---

## Defense-in-Depth Architecture

```text
Internet Users / Razorpay Webhooks
        │
        ▼ (HTTPS 443 ONLY)
┌────────────────────────────────────────────────────────┐
│ Layer 1: Edge CDN / WAF (Cloudflare / Cloud WAF)       │
│  • DDoS mitigation, bot filtering, Managed OWASP rules │
│  • Bypass JS challenge ONLY on /api/v1/webhooks/razorpay│
└───────────────────────────┬────────────────────────────┘
                            │ (TLS 1.2/1.3)
                            ▼
┌────────────────────────────────────────────────────────┐
│ Layer 2: Host Firewall (UFW) + Cloud Security Group    │
│  • Public inbound: 80/tcp (redirect), 443/tcp ONLY     │
│  • SSH (22/tcp): restricted to admin IP / VPN / bastion│
│  • Ports 8000, 5050, 3306: NEVER exposed publicly      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Layer 3: Nginx Reverse Proxy                           │
│  • Security headers (HSTS, nosniff, X-Frame-Options)   │
│  • Rate-limit zones (auth, payments, uploads, chat)    │
│  • Preserves exact raw bytes for Razorpay webhooks     │
└──────────────┬──────────────────────────┬──────────────┘
               │ (127.0.0.1:8000)         │ (127.0.0.1:5050)
               ▼                          ▼
┌────────────────────────────┐ ┌─────────────────────────┐
│ Layer 4a: FastAPI Backend  │ │ Layer 4b: HunarSathi API│
│  • Clerk RS256 + MySQL RBAC│ │  • Strict CORS allowlist│
│  • ASIGS 10-layer guardrails│ │  • Per-IP rate limiter  │
│  • Razorpay HMAC & raw body│ │  • Bounded LRU sessions │
└──────────────┬─────────────┘ └─────────────────────────┘
               │ (Private VPC / 127.0.0.1:3306 + TLS)
               ▼
┌────────────────────────────────────────────────────────┐
│ Layer 5: MySQL 8.4 LTS Database                        │
│  • Private network only (never 0.0.0.0 on internet)    │
│  • Least-privilege app user, require_secure_transport  │
│  • Triggers protecting audit_logs & refund caps        │
└────────────────────────────────────────────────────────┘
```

## Milestone 1–12 Deliverables Index

| Milestone(s) | Artifact | Purpose |
|---|---|---|
| M1–M2 (Fundamentals & Threat Model) | `docs/beginner_firewall_guide.md` | Plain-language beginner guide to firewalls, ports, WAF, TLS, CORS & trust boundaries |
| M3–M4 (Host & Cloud Firewalls) | `firewall/ufw_baseline.sh.example`, `firewall/cloud_security_groups.yaml.example` | Safe SSH-first UFW script + 3-tier Cloud Security Group blueprint |
| M5–M6 (Reverse Proxy, TLS & Rate Limits) | `nginx/hunarlink-api.conf.example` | Production Nginx TLS/headers/rate-limit proxy preserving raw webhook bytes |
| M7 (Edge WAF & Bot Protection) | `waf/cloudflare_waf_rules.json.example` | WAF rules protecting Admin/uploads/chat while keeping Razorpay webhooks intact |
| M8 (Database Network Isolation) | `mysql/my-security.cnf.example` | MySQL 8.4 private binding, TLS enforcement, and `local_infile=0` |
| M9–M10 (App & Chatbot Hardening) | `backend/app/main.py`, `backend/app/core/security.py`, `hunarsathi-chatbot/server.py`, `hunarsathi-chatbot/widget.js` | Implemented directly in code: strict CORS allowlist, bounded LRU sessions, per-IP rate limiting, security headers, disabled prod Swagger |
| M11–M12 (Verification & Incident Response) | `runbooks/incident_response_and_verification.md` | Safe read-only checks, secret-leak audit, webhook/payment incident runbook |
