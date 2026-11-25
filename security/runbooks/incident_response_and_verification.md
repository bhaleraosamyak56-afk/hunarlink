# HunarLink Safe Security Verification & Incident Response Runbook (Milestones 11–12)

## 1. Non-Destructive Security Verification Checks (Run on Staging / Production)

### A. Verify Listening Sockets (Confirm 3306, 8000, 5050 Are NOT Bound to Public IPs)
```bash
ss -tulpn
```
Expected: `nginx` listens on `:80` and `:443`; `uvicorn` (`8000`, `5050`) and `mysqld` (`3306`) listen ONLY on `127.0.0.1` or private VPC IPs.

### B. Verify Security Headers & Hidden Server Version
```bash
curl -sSI https://<your-api-domain>/healthz
```
Expected headers: `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy`, `x-correlation-id`, and NO `Server: nginx/<version>` leak.

### C. Verify Production OpenAPI Docs Are Disabled
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<your-api-domain>/docs
```
Expected in production (`APP_ENV=production`): `404`.

### D. Verify Zero Committed Secrets in Repository
```bash
git grep -nE "(rzp_live_|sk_live_|AIzaSy|BEGIN PRIVATE KEY)" -- ':!*.example' ':!*.md'
```
Expected: zero matches.

---

## 2. Incident Response Playbook (Containment Without Panic)

| Incident Scenario | Immediate Containment | Investigation & Recovery |
|---|---|---|
| **Leaked `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET`** | Rotate key immediately in Razorpay Dashboard; update server secret manager and restart FastAPI workers. | Audit `payments`, `refunds`, `payment_webhook_events`, and `audit_logs` around exposure window; reconcile against Razorpay Dashboard settlement report. |
| **Leaked `GEMINI_API_KEY` (HunarSathi)** | Revoke key in Google AI Studio immediately; replace key and tighten `HUNARSATHI_RATE_LIMIT_PER_MIN`. | Check Gemini quota usage & Nginx access logs for offending IP blocks. |
| **Suspected Webhook Spoofing Burst** | Keep raw-body HMAC verification active; block offending source CIDRs at Edge WAF / Nginx without blocking legitimate Razorpay deliveries. | Inspect `400` logs on `/api/v1/webhooks/razorpay`; confirm zero `signature_verified=0` rows altered any payment. |
| **Suspicious Seller Upload / Malware Alert** | File remains quarantined (`INFECTED` / `PENDING_SCAN`) outside web root; never served via static web server. | Review `file_security_scans` & `guardrail_cases` by `correlation_id`; suspend compromised account in MySQL `users.account_status='SUSPENDED'` if confirmed. |
| **SSH Brute-Force or Port Scan** | Confirm password auth is disabled (`PasswordAuthentication no`), SSH key auth only, and UFW/Cloud SG restricts port 22 to admin IP/VPN. | Review `/var/log/auth.log` and enable `fail2ban` if SSH must be reachable outside a VPN. |
