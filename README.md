# HunarLink — Valley Craft Guild

GI-certified Jammu & Kashmir handicrafts marketplace. Connects geo-verified artisan
workshops directly with collectors and B2B hospitality buyers — **zero middleman cut**.

> **This is a fully working frontend prototype.** Every page runs with no backend, no
> API keys and no internet connection. Data is persisted in `localStorage`, so listings
> created in the storefront appear instantly in the artisan dashboard, orders placed in
> checkout appear in the collector's order tracker, and so on.

---

## Run it

Any static file server works — there is no build step and no dependencies.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or simply open `index.html` in a browser.

> Opening via `file://` mostly works, but a few cross-page storage checks behave better
> over `http://`. A local server is recommended for the demo.

---

## Pages

| Page | What it does |
|---|---|
| `index.html` | Storefront — hero, Valley Verification Flow, craft guilds, filterable catalogue, B2B banner |
| `product.html?id=<id>` | Product detail — gallery, GI passport, add to cart, buy now |
| `auth.html` | Artisan sign-in / registration + one-tap demo evaluator logins |
| `user-portal/login.html` | Collector sign-in |
| `user-portal/profile.html` | Collector profile, addresses, UPI, wishlist |
| `user-portal/orders.html` | Order tracking with live loom/shipment stages |
| `seller-portal/dashboard.html` | Artisan Command Center — listings, orders, earnings, responses |
| `wholesale-portal/wholesale.html` | B2B bulk ordering, live lot estimator, seller routing desk |
| `admin-portal/index.html` | Master Admin Console — 12 tabs, RBAC, audit trail, GI approvals |
| `404.html` | Not-found page |

---

## Demo walkthrough (for evaluation)

1. **Storefront** — browse the catalogue, filter by guild/price/rating, sort.
2. **Valley Verification Flow** — click the three steps, then try a live GI tag lookup
   (e.g. `GI-JK-PASH-8821`).
3. **Add to cart → checkout** — 4 steps; pay via UPI. The order is saved and appears in
   the collector's order tracker.
4. **Artisan login** — `auth.html` → *Quick Evaluator Demo Logins* → one tap signs in and
   lands on the real Artisan Command Center.
5. **Admin console** — opens straight in with demo data; all 12 tabs populated.
6. **HunarSathi assistant** — bottom-right button; ask about pashmina, GI tags, or pricing.

Credentials for every demo login are pre-filled — nothing needs to be typed.

---

## Architecture

Plain HTML + CSS + vanilla JavaScript. No frameworks, no bundler, no npm install.

```
index.html · product.html · auth.html · 404.html
hunarlink_*.css / hunarlink_*.js     shared design system + storefront logic
assets/                               craft photography and illustrations
user-portal/ · seller-portal/ · wholesale-portal/ · admin-portal/
hunarsathi-chatbot/                   assistant widget + optional Python service
```

**Cross-page state** is shared through `localStorage` under `hunarlink_*` keys —
`hunarlink_auth_user`, `hunarlink_buyer_profile`, `hunarlink_cart`, `hunarlink_orders`,
`hunarlink_wishlist`, `hunarlink_custom_products`. This is why a craft listed in the
Artisan Studio shows up in the seller dashboard and in the storefront catalogue.

### Backend status

The API server is **not part of this submission and is not required**. Two components
contain optional backend integrations:

| Component | Behaviour without a backend |
|---|---|
| `admin-portal/` | Falls back to a deterministic in-memory dataset (`admin-portal/admin-offline-demo.js`). All screens stay populated and a banner states that demo data is in use. If a FastAPI server is later available on `127.0.0.1:8000`, it is used automatically instead. |
| `hunarsathi-chatbot/widget.js` | Falls back to an on-device knowledge base that answers GI, pricing, verification, wholesale and shipping questions from the live catalogue. The optional Python service (FastAPI + Gemini) adds streaming LLM answers. |

See `hunarsathi-chatbot/README.md` — running that service is **optional**.

---

## Responsive

Verified at 1440px (desktop), 820px (tablet) and 390px (mobile) across all 10 pages:
no horizontal overflow, no JS errors, all modals fit the viewport, and the admin
sidebar collapses into an off-canvas drawer below 900px.
