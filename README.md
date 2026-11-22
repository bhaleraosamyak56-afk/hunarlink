# HunarLink — Valley Craft Guild

GI-certified Jammu & Kashmir handicrafts marketplace. Connects geo-verified artisan
workshops directly with collectors and B2B hospitality buyers — **zero middleman cut**.

> **This is a fully working frontend prototype.** Every page runs with no backend, no
> API keys and no internet connection. Data is persisted in `localStorage`, so listings
> created in the artisan dashboard appear in the storefront, orders placed in checkout
> appear in the collector's order tracker, and so on.

The app is a **single-page React application**. React owns every page; there is no
static HTML fallback and no page-level controller code.

---

## Run it

The built site is committed at the repo root, so any static file server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

For development with hot reload:

```bash
cd app
npm install
npm run dev          # vite dev server
```

> The site is deployed under the `/hunarlink/` prefix (a GitHub project page), so the
> built `index.html` references `/hunarlink/assets/…`. Serving the repo root directly
> at `/` will 404 on assets — use the dev server, or serve the repo's **parent**
> directory so the `/hunarlink/` prefix resolves.

---

## Build

```bash
cd app
npm run build        # vite build --mode root -> writes to ../dist
```

Then copy the output to the repo root:

```bash
cp dist/index.html dist/404.html ./
cp dist/assets/index-*.js dist/assets/index-*.css ../assets/   # when run from app/
```

`vite.config.js` sets `base: '/hunarlink/'` for the `root` mode so asset URLs match
the deployment prefix. There is a second mode (`vite build`) that emits to `react/`
for the older subpath deployment; the root mode is the one in use.

---

## Pages

All routes are client-side. Legacy v1 URLs (`product.html`, `user-portal/login.html`,
`seller-portal/dashboard.html`, …) still resolve — `src/pages/LegacyRoutes.jsx` maps
each one to its current route.

| Route | Source | What it does |
|---|---|---|
| `/` | `pages/HomePage.jsx` | Storefront — hero, Valley Verification Flow, craft guilds, filterable catalogue, B2B banner |
| `/product?id=<id>` | `pages/ProductPage.jsx` | Product detail — gallery with hover zoom, GI passport, add to bag |
| `/auth` | `pages/AuthPage.jsx` | Artisan sign-in / registration, GI verification capture suite, demo evaluator logins |
| `/login` | `pages/portal/LoginPage.jsx` | Collector sign-in / sign-up, password or 6-digit OTP |
| `/profile` | `pages/ProfilePage.jsx` | Collector profile, addresses, UPI, wishlist |
| `/orders` | `pages/OrdersPage.jsx` | Order tracking with live loom/shipment stages |
| `/seller` | `pages/portal/SellerPage.jsx` | Artisan Command Center — publish, customize, orders, responses |
| `/wholesale` | `pages/WholesalePage.jsx` | B2B bulk ordering, live lot estimator, seller routing desk |
| `/admin` | `pages/portal/AdminPage.jsx` | Master admin console — 12 tabs, KPIs, GI audits, dealer matching |

Demo credentials:

* Admin console — `admin@hunarlink.com` / `AdminPass@123` (or the one-tap session)
* Artisan portal — any demo pill on `/auth`
* Collector — the "1-Tap Demo Login" on `/login`

---

## Project layout

```
app/                  Vite + React source
  src/
    pages/            route components
      portal/         seller, admin and collector login
      auth/           the auth page's static form markup
    components/       shared UI (header, drawers, modals, sections)
    state/            StoreContext — the shared store
    data/             product catalogue, guilds, admin demo dataset
    styles/           one stylesheet per surface
  public/             static assets copied into the build (images, chatbot)
  vite.config.js
assets/               deployed static assets + the live hashed JS/CSS bundle
index.html            the built SPA shell (committed)
404.html              SPA deep-link fallback for GitHub Pages
hunarsathi-chatbot/   vanilla-JS chat widget (injected by React, builds its own UI)
```

---

## Notes

* **Deep links return HTTP 404.** GitHub Pages serves `404.html` for any path it
  cannot resolve; that page stashes the requested route and hands it back to the
  router. Visitors see the right page, but crawlers and link-preview bots see a 404.
  Fixing that needs a host with SPA rewrites.
* **Cross-tab sync requires a reload.** Portals write `localStorage` directly, so a
  change made in one tab shows up in another only after that tab reloads.
* **The chatbot's backend is not included.** `hunarsathi-chatbot/widget.js` calls
  `127.0.0.1:5050`; with no backend it falls back to canned responses.
