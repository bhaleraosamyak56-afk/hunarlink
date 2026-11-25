# Beginner's Plain-Language Firewall & Security Guide for HunarLink

This guide explains every layer protecting HunarLink in plain English so you can deploy and maintain it safely without breaking your app or locking yourself out.

## 1. What Is a Port, and Why Should Most Ports Stay Closed?
Think of your server as an office building:
- **Port 443 (HTTPS)** is the **front reception desk** — customers and Razorpay webhooks talk to HunarLink here through encrypted HTTPS.
- **Port 80 (HTTP)** is a tiny sign at the front door that immediately redirects visitors to Port 443 (HTTPS).
- **Port 22 (SSH)** is the **staff-only maintenance entrance** — only *you* (from your trusted IP or VPN) should be able to enter here, using SSH keys (never weak passwords).
- **Ports 8000 (FastAPI), 5050 (HunarSathi Chatbot), and 3306 (MySQL)** are **internal office rooms** — nobody on the public internet should EVER reach them directly! Only Nginx (for 8000/5050) and FastAPI (for 3306) talk to them privately.

## 2. Host Firewall vs. Cloud Security Group vs. WAF
You want **three separate layers** so a mistake in one layer does not expose everything:
1. **Cloud Security Group (Outside Fence):** Runs at your cloud provider (AWS, DigitalOcean, GCP, Azure) *before* traffic even touches your server. Blocks all inbound ports except 80, 443, and restricted SSH.
2. **Host Firewall — UFW (Front Door Lock):** Runs inside your Linux server. Even if someone misconfigures the cloud panel, UFW still drops unauthorized traffic.
3. **WAF — Web Application Firewall (Security Guard at Reception):** Inspects HTTP requests arriving on Port 443 to stop bots, credential stuffing, and OWASP attacks *before* they reach FastAPI.

## 3. Why Separate Development, Staging, and Production?
| Environment | Purpose | Key Rules |
|---|---|---|
| **Development (Local)** | Coding & running `pytest` | Localhost only (`127.0.0.1`), mock/test keys only, Swagger `/docs` enabled |
| **Staging** | Testing real MySQL 8.4 + Razorpay Test Mode | Real HTTPS + firewall rules, `rzp_test_*` keys ONLY, separate staging DB |
| **Production** | Real buyers, artisans & INR money | `APP_ENV=production` (`/docs` OFF), `rzp_live_*` keys in secret manager, strict monitoring & daily encrypted backups |

## 4. Golden Safety Rules Before Touching Any Firewall
1. **Never run `ufw reset` blindly on a remote server** — always verify SSH is allowed first!
2. **Always keep a second SSH session open** when applying firewall changes so you can roll back immediately if something blocks new logins.
3. **Never put `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, or MySQL passwords into Git or `VITE_*` frontend variables.**
4. **Never confuse CORS with a firewall:** CORS tells *browsers* which frontend domain may read API responses, whereas attackers using `curl` or Python ignore CORS completely — that is why FastAPI still enforces Clerk JWT + MySQL RBAC + Razorpay HMAC on every request.
