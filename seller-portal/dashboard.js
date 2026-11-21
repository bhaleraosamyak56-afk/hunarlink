/* ==========================================================================
   HunarLink — Seller / Artisan Portal Dashboard Controller
   Full Bidirectional Sync with HunarLink Marketplace via localStorage
   ========================================================================== */

const STORAGE_KEYS = {
  AUTH: "hunarlink_auth_user",
  CUSTOM_PRODUCTS: "hunarlink_custom_products",
  OVERRIDES: "hunarlink_product_overrides",
  ORDERS: "hunarlink_orders",
  REVIEWS: "hunarlink_reviews",
  INQUIRIES: "hunarlink_seller_inquiries",
  WISHLIST: "hunarlink_wishlist",
  CART: "hunarlink_cart"
};

const GUILD_META = {
  pashmina: { label: "Pashmina & Kani Guild", defaultImg: "assets/products/pashmina_01.jpg" },
  walnut: { label: "Walnut Woodcarving", defaultImg: "assets/products/walnut_01.jpg" },
  "papier-mache": { label: "Papier-Mâché Art", defaultImg: "assets/products/papier_01.jpg" },
  "silk-rugs": { label: "Silk-on-Silk Rugs", defaultImg: "assets/products/silkrug_01.jpg" },
  sozni: { label: "Kani Jamawar & Sozni", defaultImg: "assets/products/kani_01.jpg" }
};

const IMAGE_PRESETS = [
  { key: "pashmina", label: "Pashmina", path: "assets/products/pashmina_01.jpg" },
  { key: "walnut", label: "Walnut", path: "assets/products/walnut_01.jpg" },
  { key: "papier-mache", label: "Papier-Mâché", path: "assets/products/papier_01.jpg" },
  { key: "silk-rugs", label: "Silk Rug", path: "assets/products/silkrug_01.jpg" },
  { key: "sozni", label: "Kani & Sozni", path: "assets/products/kani_01.jpg" },
  { key: "loom", label: "Kani Loom", path: "assets/image_1.jpg" }
];

const TRACKING_STAGES = [
  "1. Order Confirmed",
  "2. GI Seal Verified",
  "3. Packed at Atelier",
  "4. Insured Transit",
  "5. Delivered"
];

/* Starter featured crafts so returning demo artisans immediately have catalog items to customize */
const DEMO_SEED_FALLBACK = [
  {
    id: "hl-pash-001",
    title: "Royal Khudrang Pashmina Shawl",
    guild: "pashmina",
    guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Ghulam Qadir Mir",
    district: "Srinagar",
    price: 1650,
    mrp: 1990,
    rating: 4.9,
    reviewCount: 42,
    giId: "GI-JK-PASH-8821",
    giLevel: 3,
    purityMetric: "14.2 Micron Changthangi Fleece • 100% Hand-Spun",
    loomHours: 420,
    dimensions: "205 cm × 102 cm",
    stock: 4,
    image: "assets/products/pashmina_01.jpg",
    description: "Unbleached natural Khudrang Ladakhi Changthangi pashmina hand-woven on a traditional wooden loom in Srinagar with delicate Sozni hand-embroidered border.",
    isCatalogSeed: true
  },
  {
    id: "hl-pash-002",
    title: "Jamawar Heirloom Stole",
    guild: "pashmina",
    guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Ghulam Qadir Mir",
    district: "Srinagar",
    price: 1850,
    mrp: 1999,
    rating: 4.9,
    reviewCount: 37,
    giId: "GI-JK-PASH-8810",
    giLevel: 3,
    purityMetric: "14.5 Micron Changthangi • Natural Indigo & Madder Dyes",
    loomHours: 980,
    dimensions: "200 cm × 100 cm",
    stock: 3,
    image: "assets/products/pashmina_02.jpg",
    description: "Heirloom Kani-border wrap blending deep forest-emerald field work with traditional Badam paisley motifs, dyed with natural valley indigo.",
    isCatalogSeed: true
  },
  {
    id: "hl-waln-001",
    title: "Openwork Chinar Lattice Walnut Chest",
    guild: "walnut",
    guildLabel: "Walnut Woodcarving",
    artisan: "Fayaz Ahmad Wani",
    district: "Anantnag",
    price: 14800,
    mrp: 21500,
    rating: 4.9,
    reviewCount: 46,
    giId: "GI #JK-WNT-1180",
    giLevel: 3,
    purityMetric: "Seasoned Juglans Regia Walnut • 5-Yr Cured",
    loomHours: 220,
    dimensions: "42 cm × 26 cm × 22 cm",
    stock: 2,
    image: "assets/products/walnut_01.jpg",
    description: "Single-block seasoned Kashmiri walnut root chest chiseled with intricate Chinar leaf openwork and traditional Jali patterns, finished with natural beeswax polish.",
    isCatalogSeed: true
  }
];

const PortalState = {
  seller: null,
  activeTab: "overview",
  selectedNewImage: "assets/products/pashmina_01.jpg",
  selectedEditImage: null
};

/* ==========================================================================
   Storage & Formatting Helpers
   ========================================================================== */
function loadStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    showPortalToast("⚠️ Storage quota warning — try a smaller photo.");
  }
}

function formatINR(num) {
  return "₹" + Math.round(Number(num) || 0).toLocaleString("en-IN");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveImgSrc(path) {
  if (!path) return "../assets/image_1.jpg";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://") || path.startsWith("../")) {
    return path;
  }
  return "../" + path.replace(/^\.?\//, "");
}

function showPortalToast(msg) {
  const el = document.getElementById("portal-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showPortalToast._t);
  showPortalToast._t = setTimeout(() => el.classList.remove("show"), 3400);
}

/* ==========================================================================
   Auth & Verification Gate Initialization
   ========================================================================== */
function initPortal() {
  const user = loadStore(STORAGE_KEYS.AUTH, null);

  if (!user || !user.isLoggedIn || user.role !== "artisan") {
    document.getElementById("auth-gate-screen").style.display = "flex";
    document.getElementById("portal-shell").style.display = "none";
    return;
  }

  PortalState.seller = user;
  document.getElementById("auth-gate-screen").style.display = "none";
  document.getElementById("portal-shell").style.display = "grid";

  populateSellerIdentity();
  renderImagePresets();
  prefillNewProductDefaults();
  seedInitialSellerInquiriesIfEmpty();
  refreshAllData(false);

  // Real-time cross-tab sync when buyers place orders or leave reviews on HunarLink!
  window.addEventListener("storage", (ev) => {
    if ([STORAGE_KEYS.ORDERS, STORAGE_KEYS.REVIEWS, STORAGE_KEYS.WISHLIST, STORAGE_KEYS.CART, STORAGE_KEYS.CUSTOM_PRODUCTS].includes(ev.key)) {
      refreshAllData(false);
      if (ev.key === STORAGE_KEYS.ORDERS) {
        showPortalToast("🔔 New customer order received on HunarLink! Check Incoming Orders.");
      } else if (ev.key === STORAGE_KEYS.REVIEWS) {
        showPortalToast("💬 New buyer review received on your craft!");
      }
    }
  });
}

function populateSellerIdentity() {
  const s = PortalState.seller;
  const initials = s.badge || (s.name || "UM").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  document.getElementById("seller-avatar").textContent = initials;
  document.getElementById("seller-name").textContent = s.name || "Verified Artisan";
  document.getElementById("seller-atelier").textContent = s.business || `${s.district || "Kashmir"} Heritage Atelier`;

  const giBadge = document.getElementById("seller-gi-badge");
  if (s.giCertified) {
    giBadge.className = "seller-status-badge";
    giBadge.textContent = `🛡️ GI Certified • ${s.giId || "Verified"}`;
  } else {
    giBadge.className = "seller-status-badge standard";
    giBadge.textContent = "✓ Verified Standard Artisan";
  }

  // Overview Verification Banner
  document.getElementById("banner-welcome-title").textContent = `Welcome, ${s.name}`;
  document.getElementById("banner-welcome-desc").textContent = s.skillDescription
    ? `"${s.skillDescription}"`
    : `Your ${s.business || "Artisan Studio"} (${s.district || "Jammu & Kashmir"} Cluster) is verified and connected live to the HunarLink marketplace.`;

  const pills = [];
  pills.push(`<span class="v-pill gold">✓ Account Authenticated</span>`);
  if (s.giCertified) {
    pills.push(`<span class="v-pill gold">🛡️ GI ID: ${escapeHtml(s.giId || "Registered")}</span>`);
    if (s.liveVerification) {
      if (s.liveVerification.certPhotoCaptured) pills.push(`<span class="v-pill">📷 Live GI Certificate Verified</span>`);
      if (s.liveVerification.productVideoRecorded) pills.push(`<span class="v-pill">🎥 Workshop Video Verified (${s.liveVerification.videoDurationSec || 5}s)</span>`);
      if (s.liveVerification.passportPhotoCaptured) pills.push(`<span class="v-pill">🤳 Live Passport ID Verified</span>`);
    }
  } else {
    pills.push(`<span class="v-pill">📝 Standard Seller Account</span>`);
    pills.push(`<span class="v-pill">📍 ${escapeHtml(s.district || "Jammu & Kashmir")} Cluster</span>`);
  }
  document.getElementById("verification-pills").innerHTML = pills.join("");
}

function logoutSeller() {
  localStorage.removeItem(STORAGE_KEYS.AUTH);
  window.location.href = "../auth.html?mode=login&role=artisan";
}

/* ==========================================================================
   Tab Navigation Controller
   ========================================================================== */
const TAB_TITLES = {
  overview: {
    title: "Artisan Command Center",
    sub: "Real-time overview of your verified HunarLink store, earnings, and buyer activity."
  },
  list: {
    title: "List New Craft on HunarLink",
    sub: "Publish a handmade Kashmiri craft directly to live buyers with zero middleman cut."
  },
  products: {
    title: "My Listed Products & Customizer",
    sub: "Customize prices, stock, photos, GI details, and descriptions anytime."
  },
  orders: {
    title: "Incoming Customer Orders",
    sub: "Inspect complete customer information, payment status, GI items, and dispatch tracking."
  },
  responses: {
    title: "Product Responses & Buyer Feedback",
    sub: "See wishlist saves, active cart interest, customer reviews, and send artisan replies."
  }
};

function switchSellerTab(tabName) {
  PortalState.activeTab = tabName;

  document.querySelectorAll(".nav-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });

  const meta = TAB_TITLES[tabName] || TAB_TITLES.overview;
  document.getElementById("topbar-heading").textContent = meta.title;
  document.getElementById("topbar-sub").textContent = meta.sub;

  if (tabName === "orders") markOrdersSeenBySeller();
  refreshAllData(false);
}

/* ==========================================================================
   Data Aggregation (Products, Orders, Responses)
   ========================================================================== */
function getSellerManagedProducts() {
  const custom = loadStore(STORAGE_KEYS.CUSTOM_PRODUCTS, []);
  const overrides = loadStore(STORAGE_KEYS.OVERRIDES, {});
  const sellerNameLower = (PortalState.seller?.name || "").toLowerCase();

  // Include all seller-created custom products + matching demo catalog crafts
  const seedMatches = DEMO_SEED_FALLBACK.filter(p => {
    const a = p.artisan.toLowerCase();
    return sellerNameLower.includes(a) || a.includes(sellerNameLower.replace(/^ustad\s+|^master\s+/i, ""));
  });

  const combined = [...custom, ...seedMatches];
  const seen = new Set();
  return combined
    .filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .map(p => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p));
}

function getAllOrders() {
  return loadStore(STORAGE_KEYS.ORDERS, []);
}

function seedInitialSellerInquiriesIfEmpty() {
  const existing = loadStore(STORAGE_KEYS.INQUIRIES, null);
  if (existing && existing.length > 0) return;

  const sample = [
    {
      id: "inq-101",
      type: "Inquiry",
      author: "Ananya Kapoor (New Delhi)",
      productTitle: "Royal Khudrang Pashmina Shawl",
      date: "Today, 10:15 AM",
      rating: null,
      comment: "Namaste Ustad ji! Does this shawl come with the official J&K GI lab micron report and gift cedar box?",
      reply: ""
    },
    {
      id: "inq-102",
      type: "Review",
      author: "Vikramaditya Singh (Mumbai)",
      productTitle: "Openwork Chinar Lattice Walnut Chest",
      date: "Yesterday",
      rating: 5,
      comment: "Extraordinary deep relief carving! Scanned the GI QR tag on arrival and verified Anantnag lineage immediately.",
      reply: "Thank you for supporting Kashmiri walnut artisans directly. Wishing your family generations of joy with this heirloom!"
    }
  ];
  saveStore(STORAGE_KEYS.INQUIRIES, sample);
}

function refreshAllData(showToastMsg) {
  const products = getSellerManagedProducts();
  const orders = getAllOrders();
  const reviewsObj = loadStore(STORAGE_KEYS.REVIEWS, {});
  const inquiries = loadStore(STORAGE_KEYS.INQUIRIES, []);

  // Count all reviews across seller products + inquiries
  let reviewCount = inquiries.length;
  Object.values(reviewsObj).forEach(arr => {
    if (Array.isArray(arr)) reviewCount += arr.length;
  });

  const newOrderCount = orders.filter(o => o.isNewForSeller).length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const liveCount = products.filter(p => p.status !== "paused").length;

  // Sidebar Badges
  document.getElementById("badge-products-count").textContent = products.length;
  const ordBadge = document.getElementById("badge-orders-count");
  ordBadge.textContent = newOrderCount > 0 ? `${newOrderCount} NEW` : orders.length;
  ordBadge.classList.toggle("alert", newOrderCount > 0);
  document.getElementById("badge-responses-count").textContent = reviewCount;

  // Overview KPIs
  document.getElementById("kpi-listed").textContent = products.length;
  document.getElementById("kpi-listed-sub").textContent = `${liveCount} active live on HunarLink`;
  document.getElementById("kpi-orders").textContent = orders.length;
  document.getElementById("kpi-orders-sub").textContent = newOrderCount > 0
    ? `${newOrderCount} new order(s) awaiting review`
    : "All orders synced live";
  document.getElementById("kpi-revenue").textContent = formatINR(totalRevenue);
  document.getElementById("kpi-responses").textContent = reviewCount;

  renderOverviewLatestOrders(orders);
  renderSellerProducts();
  renderIncomingOrders();
  renderProductResponses();

  if (showToastMsg) {
    showPortalToast("✓ Synced live products, customer orders & buyer responses from HunarLink!");
  }
}

/* ==========================================================================
   TAB 1: Overview Latest Orders Preview
   ========================================================================== */
function renderOverviewLatestOrders(orders) {
  const wrap = document.getElementById("overview-latest-orders");
  if (!wrap) return;

  if (!orders.length) {
    wrap.innerHTML = `
      <div style="text-align: center; padding: 28px; color: var(--text-500); font-size: 0.86rem;">
        No orders received yet. When a user orders on HunarLink, complete customer and item details appear here instantly!
      </div>
    `;
    return;
  }

  wrap.innerHTML = orders.slice(0, 2).map(o => {
    const buyerName = o.buyer?.name || (o.address || "").split(",")[0] || "HunarLink Collector";
    const stageLbl = TRACKING_STAGES[(o.stage || 1) - 1] || TRACKING_STAGES[0];
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px; background: var(--ivory-bg); border: 1px solid var(--border-light); border-radius: 12px; margin-bottom: 10px;">
        <div>
          <div style="font-weight: 800; color: var(--forest-950); font-size: 0.92rem;">
            ${escapeHtml(o.id)} ${o.isNewForSeller ? '<span class="status-chip new-order" style="margin-left: 6px;">NEW ORDER</span>' : ""}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-700); margin-top: 2px;">
            <strong>Buyer:</strong> ${escapeHtml(buyerName)} • ${(o.items || []).length} item(s) • <strong>${formatINR(o.total)}</strong>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-500); margin-top: 2px;">
            ${escapeHtml(o.date || "Recent")} • ${escapeHtml(o.paymentMethod || "Escrow")} • Stage: ${escapeHtml(stageLbl)}
          </div>
        </div>
        <button type="button" class="btn-forest" onclick="switchSellerTab('orders')">Inspect Full Order →</button>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   TAB 2: List New Product on Live HunarLink Platform
   ========================================================================== */
function renderImagePresets() {
  const container = document.getElementById("np-image-presets");
  if (!container) return;
  container.innerHTML = IMAGE_PRESETS.map(p => `
    <button type="button" class="img-preset-btn ${PortalState.selectedNewImage === p.path ? "selected" : ""}"
      data-path="${p.path}" onclick="selectImagePreset('${p.path}', '${p.label}')">
      <img src="${resolveImgSrc(p.path)}" alt="${p.label}">
      <span>${p.label}</span>
    </button>
  `).join("");
}

function selectImagePreset(path, label) {
  PortalState.selectedNewImage = path;
  document.querySelectorAll("#np-image-presets .img-preset-btn").forEach(b => {
    b.classList.toggle("selected", b.dataset.path === path);
  });
  const preview = document.getElementById("np-custom-preview");
  if (preview) preview.style.display = "none";
  const status = document.getElementById("np-photo-status");
  if (status) status.textContent = `Selected preset: ${label}`;
}

function syncDefaultPresetForGuild() {
  const guild = document.getElementById("np-guild")?.value;
  const meta = GUILD_META[guild];
  if (meta && !PortalState.selectedNewImage.startsWith("data:")) {
    selectImagePreset(meta.defaultImg, meta.label);
  }
}

function prefillNewProductDefaults() {
  const s = PortalState.seller;
  if (!s) return;
  const guildEl = document.getElementById("np-guild");
  const distEl = document.getElementById("np-district");
  const giEl = document.getElementById("np-gi-id");

  if (guildEl && s.craft && GUILD_META[s.craft]) {
    guildEl.value = s.craft;
    syncDefaultPresetForGuild();
  }
  if (distEl && s.district) {
    distEl.value = s.district;
  }
  if (giEl && s.giCertified && s.giId) {
    giEl.value = s.giId;
  }
}

function updatePricePreview() {
  const price = Number(document.getElementById("np-price")?.value || 0);
  const mrp = Number(document.getElementById("np-mrp")?.value || 0);
  const hint = document.getElementById("np-discount-hint");
  if (!hint) return;
  if (price > 0 && mrp > price) {
    const pct = Math.round(((mrp - price) / mrp) * 100);
    hint.textContent = `✓ Shows ${pct}% OFF direct artisan savings on HunarLink`;
    hint.style.color = "var(--success-600)";
  } else {
    hint.textContent = "MRP should be equal to or higher than Selling Price";
    hint.style.color = "var(--text-500)";
  }
}

function handleProductImageUpload(event, target) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Resize nicely to keep localStorage lightweight & crisp
      const canvas = document.createElement("canvas");
      const maxW = 720;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

      if (target === "new") {
        PortalState.selectedNewImage = dataUrl;
        document.querySelectorAll("#np-image-presets .img-preset-btn").forEach(b => b.classList.remove("selected"));
        const preview = document.getElementById("np-custom-preview");
        if (preview) {
          preview.src = dataUrl;
          preview.style.display = "block";
        }
        const status = document.getElementById("np-photo-status");
        if (status) status.textContent = `✓ Uploaded custom craft photo: ${file.name}`;
      } else {
        PortalState.selectedEditImage = dataUrl;
        const preview = document.getElementById("edit-photo-preview");
        if (preview) preview.src = dataUrl;
      }
      showPortalToast("📷 Product photograph ready!");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function resetNewProductForm() {
  setTimeout(() => {
    PortalState.selectedNewImage = "assets/products/pashmina_01.jpg";
    renderImagePresets();
    prefillNewProductDefaults();
    const preview = document.getElementById("np-custom-preview");
    if (preview) preview.style.display = "none";
  }, 20);
}

function handlePublishProduct(e) {
  e.preventDefault();
  const s = PortalState.seller;
  const title = document.getElementById("np-title").value.trim();
  const guild = document.getElementById("np-guild").value;
  const price = parseInt(document.getElementById("np-price").value, 10);
  const mrpInput = parseInt(document.getElementById("np-mrp").value, 10);
  const mrp = Math.max(price, mrpInput || Math.round(price * 1.18));
  const stock = parseInt(document.getElementById("np-stock").value, 10) || 1;
  const loomHours = parseInt(document.getElementById("np-hours").value, 10) || 120;
  const dimensions = document.getElementById("np-dimensions").value.trim();
  const district = document.getElementById("np-district").value;
  const purityMetric = document.getElementById("np-purity").value.trim();
  const giIdRaw = document.getElementById("np-gi-id").value.trim();
  const description = document.getElementById("np-description").value.trim();

  const guildInfo = GUILD_META[guild] || GUILD_META.pashmina;
  const generatedGi = s.giCertified
    ? (giIdRaw || s.giId || `GI-JK-${Math.floor(1000 + Math.random() * 9000)}`)
    : (giIdRaw || `HL-ART-${Math.floor(1000 + Math.random() * 9000)}`);

  const newProduct = {
    id: "hl-seller-" + Date.now(),
    title,
    guild,
    guildLabel: guildInfo.label,
    artisan: s.name,
    sellerEmail: s.email,
    district,
    price,
    mrp,
    rating: 5.0,
    reviewCount: 0,
    giId: generatedGi,
    giLevel: s.giCertified ? 3 : 1,
    purityMetric,
    loomHours,
    dimensions,
    stock,
    status: "live",
    image: PortalState.selectedNewImage || guildInfo.defaultImg,
    description,
    listedAt: new Date().toISOString()
  };

  const customProducts = loadStore(STORAGE_KEYS.CUSTOM_PRODUCTS, []);
  customProducts.unshift(newProduct);
  saveStore(STORAGE_KEYS.CUSTOM_PRODUCTS, customProducts);

  document.getElementById("new-product-form").reset();
  resetNewProductForm();

  refreshAllData(false);
  switchSellerTab("products");
  showPortalToast(`✦ "${title}" is now LIVE on HunarLink (${generatedGi})!`);
}

/* ==========================================================================
   TAB 3: My Products & Customize Product Details
   ========================================================================== */
function renderSellerProducts() {
  const grid = document.getElementById("seller-products-grid");
  if (!grid) return;

  const query = (document.getElementById("seller-prod-search")?.value || "").trim().toLowerCase();
  const wishlist = loadStore(STORAGE_KEYS.WISHLIST, []);
  const orders = getAllOrders();

  const products = getSellerManagedProducts().filter(p =>
    !query ||
    p.title.toLowerCase().includes(query) ||
    (p.giId || "").toLowerCase().includes(query) ||
    (p.guildLabel || "").toLowerCase().includes(query)
  );

  if (!products.length) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 38px 16px; color: var(--text-500);">
        <div style="font-size: 2rem; margin-bottom: 8px;">🧶</div>
        <strong style="color: var(--forest-950);">No crafts listed yet</strong>
        <p style="font-size: 0.82rem; margin: 6px 0 14px;">Publish your first Kashmiri craft to make it available to HunarLink buyers worldwide.</p>
        <button type="button" class="btn-gold" onclick="switchSellerTab('list')">＋ List Your First Product</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => {
    const isPaused = p.status === "paused";
    const discPct = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
    const wishCount = wishlist.includes(p.id) ? 1 : 0;
    const soldCount = orders.reduce((acc, o) => {
      const hit = (o.items || []).filter(i => i.productId === p.id || i.title === p.title);
      return acc + hit.reduce((s, i) => s + (i.qty || 1), 0);
    }, 0);

    return `
      <article class="seller-product-card">
        <div>
          <div class="sp-img-wrap">
            <img src="${resolveImgSrc(p.image)}" alt="${escapeHtml(p.title)}">
            <div class="sp-badges">
              <span class="status-chip gi">${escapeHtml(p.giId || "GI-VERIFIED")}</span>
              <span class="status-chip ${isPaused ? "paused" : "live"}">${isPaused ? "⏸ Paused" : "● Live"}</span>
            </div>
          </div>

          <div class="sp-body">
            <div class="sp-guild">${escapeHtml(p.guildLabel || p.guild)} • ${escapeHtml(p.district || "J&K")}</div>
            <h4 class="sp-title">${escapeHtml(p.title)}</h4>
            <div class="sp-price-row">
              <span class="sp-price">${formatINR(p.price)}</span>
              ${p.mrp > p.price ? `<span class="sp-mrp">${formatINR(p.mrp)}</span>` : ""}
              ${discPct > 0 ? `<span style="font-size: 0.72rem; font-weight: 700; color: var(--success-600);">${discPct}% OFF</span>` : ""}
            </div>
            <p style="font-size: 0.76rem; color: var(--text-500); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${escapeHtml(p.description)}
            </p>
            <div class="sp-metrics-strip">
              <div>
                <div class="sp-metric-val">${p.stock}</div>
                <div class="sp-metric-lbl">In Stock</div>
              </div>
              <div>
                <div class="sp-metric-val">${soldCount}</div>
                <div class="sp-metric-lbl">Ordered</div>
              </div>
              <div>
                <div class="sp-metric-val">♡ ${wishCount + (p.reviewCount || 0)}</div>
                <div class="sp-metric-lbl">Interest</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sp-actions">
          <button type="button" class="btn-forest" onclick="openEditProductModal('${p.id}')">✏️ Customize</button>
          <a href="../product.html?id=${encodeURIComponent(p.id)}" target="_blank" class="btn-outline">Store ↗</a>
          <button type="button" class="btn-outline" onclick="quickAdjustStock('${p.id}', 1)" title="Add +1 Stock">+1 Stock</button>
          ${!p.isCatalogSeed ? `<button type="button" class="btn-danger-outline" onclick="deleteCustomProduct('${p.id}')" title="Delete Listing">🗑️</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function openEditProductModal(productId) {
  const product = getSellerManagedProducts().find(p => p.id === productId);
  if (!product) return;

  PortalState.selectedEditImage = product.image;

  document.getElementById("edit-id").value = product.id;
  document.getElementById("edit-title").value = product.title || "";
  document.getElementById("edit-guild").value = product.guild || "pashmina";
  document.getElementById("edit-price").value = product.price || 1500;
  document.getElementById("edit-mrp").value = product.mrp || 1990;
  document.getElementById("edit-stock").value = product.stock ?? 1;
  document.getElementById("edit-hours").value = product.loomHours || 120;
  document.getElementById("edit-dimensions").value = product.dimensions || "";
  document.getElementById("edit-status").value = product.status === "paused" ? "paused" : "live";
  document.getElementById("edit-purity").value = product.purityMetric || "";
  document.getElementById("edit-gi-id").value = product.giId || "";
  document.getElementById("edit-description").value = product.description || "";
  document.getElementById("edit-photo-preview").src = resolveImgSrc(product.image);

  document.getElementById("edit-product-modal").classList.add("open");
}

function closeEditModal() {
  document.getElementById("edit-product-modal").classList.remove("open");
}

function saveCustomizedProduct(e) {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;
  const guild = document.getElementById("edit-guild").value;
  const price = parseInt(document.getElementById("edit-price").value, 10) || 1000;
  const mrpInput = parseInt(document.getElementById("edit-mrp").value, 10) || price;

  const updates = {
    title: document.getElementById("edit-title").value.trim(),
    guild,
    guildLabel: (GUILD_META[guild] && GUILD_META[guild].label) || guild,
    price,
    mrp: Math.max(price, mrpInput),
    stock: Math.max(0, parseInt(document.getElementById("edit-stock").value, 10) || 0),
    loomHours: parseInt(document.getElementById("edit-hours").value, 10) || 120,
    dimensions: document.getElementById("edit-dimensions").value.trim(),
    status: document.getElementById("edit-status").value,
    purityMetric: document.getElementById("edit-purity").value.trim(),
    giId: document.getElementById("edit-gi-id").value.trim(),
    description: document.getElementById("edit-description").value.trim(),
    image: PortalState.selectedEditImage || GUILD_META[guild].defaultImg,
    updatedAt: new Date().toISOString()
  };

  // Update in hunarlink_custom_products if custom, otherwise persist in hunarlink_product_overrides
  const custom = loadStore(STORAGE_KEYS.CUSTOM_PRODUCTS, []);
  const idx = custom.findIndex(p => p.id === id);
  if (idx !== -1) {
    custom[idx] = { ...custom[idx], ...updates };
    saveStore(STORAGE_KEYS.CUSTOM_PRODUCTS, custom);
  } else {
    const overrides = loadStore(STORAGE_KEYS.OVERRIDES, {});
    overrides[id] = { ...(overrides[id] || {}), ...updates };
    saveStore(STORAGE_KEYS.OVERRIDES, overrides);
  }

  closeEditModal();
  refreshAllData(false);
  showPortalToast(`✓ Customized "${updates.title}" — live on HunarLink!`);
}

function quickAdjustStock(productId, delta) {
  const custom = loadStore(STORAGE_KEYS.CUSTOM_PRODUCTS, []);
  const idx = custom.findIndex(p => p.id === productId);
  if (idx !== -1) {
    custom[idx].stock = Math.max(0, (custom[idx].stock || 0) + delta);
    saveStore(STORAGE_KEYS.CUSTOM_PRODUCTS, custom);
  } else {
    const overrides = loadStore(STORAGE_KEYS.OVERRIDES, {});
    const prod = getSellerManagedProducts().find(p => p.id === productId);
    const nextStock = Math.max(0, ((prod && prod.stock) || 0) + delta);
    overrides[productId] = { ...(overrides[productId] || {}), stock: nextStock };
    saveStore(STORAGE_KEYS.OVERRIDES, overrides);
  }
  refreshAllData(false);
  showPortalToast("✓ Stock updated and synced to storefront!");
}

function deleteCustomProduct(productId) {
  if (!confirm("Remove this product listing from HunarLink?")) return;
  const custom = loadStore(STORAGE_KEYS.CUSTOM_PRODUCTS, []).filter(p => p.id !== productId);
  saveStore(STORAGE_KEYS.CUSTOM_PRODUCTS, custom);
  refreshAllData(false);
  showPortalToast("Listing removed from HunarLink catalog.");
}

/* ==========================================================================
   TAB 4: Incoming Customer Orders (Complete Order Information & Fulfillment)
   ========================================================================== */
function markOrdersSeenBySeller() {
  const orders = getAllOrders();
  let changed = false;
  orders.forEach(o => {
    if (o.isNewForSeller) {
      o.isNewForSeller = false;
      changed = true;
    }
  });
  if (changed) saveStore(STORAGE_KEYS.ORDERS, orders);
}

function renderIncomingOrders() {
  const container = document.getElementById("orders-container");
  if (!container) return;

  const filter = document.getElementById("order-stage-filter")?.value || "all";
  let orders = getAllOrders();

  if (filter === "active") {
    orders = orders.filter(o => (o.stage || 1) < 5);
  } else if (filter === "delivered") {
    orders = orders.filter(o => (o.stage || 1) >= 5);
  }

  if (!orders.length) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: var(--text-500);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">📦</div>
        <strong style="color: var(--forest-950);">No matching orders yet</strong>
        <p style="font-size: 0.82rem; margin: 6px 0 16px;">When a customer orders any product on HunarLink, you receive every customer, shipping, payment, and item detail here.</p>
        <button type="button" class="btn-gold" onclick="simulateIncomingBuyerOrder()">⚡ Simulate a Live Customer Order</button>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(o => {
    const buyer = o.buyer || {};
    const buyerName = buyer.name || (o.address || "").split(",")[0] || "HunarLink Collector";
    const buyerPhone = buyer.phone || "+91 98110 44210";
    const buyerEmail = buyer.email || "collector@hunarlink.in";
    const addrType = buyer.addressType || "Home";
    const locality = buyer.locality || o.address || "Verified Delivery Address";
    const cityPin = buyer.city ? `${buyer.city}${buyer.pincode ? " - " + buyer.pincode : ""}` : "India (Insured Transit)";
    const payStatus = o.paymentStatus || "Escrow Protected";
    const stage = o.stage || 1;
    const subtotal = o.subtotal || o.total || 0;
    const discount = o.discount || 0;

    return `
      <div class="order-card ${o.isNewForSeller ? "highlight-new" : ""}">
        <div class="order-head">
          <div>
            <div class="order-id-title">
              Order #${escapeHtml(o.id)}
              ${o.isNewForSeller ? '<span class="status-chip new-order" style="margin-left: 8px;">NEW ORDER</span>' : ""}
            </div>
            <div class="order-meta-line">
              📅 Placed on <strong>${escapeHtml(o.date || "Recent")}</strong>${o.time ? ` at ${escapeHtml(o.time)}` : ""} •
              💳 ${escapeHtml(o.paymentMethod || "UPI Verified Escrow")} •
              <strong style="color: var(--success-600);">${escapeHtml(payStatus)}</strong>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="status-chip live">${escapeHtml(TRACKING_STAGES[stage - 1] || TRACKING_STAGES[0])}</span>
            <button type="button" class="btn-outline" onclick="window.print()">🖨️ Print Packing Slip</button>
          </div>
        </div>

        <div class="order-detail-grid">
          <!-- Complete Buyer & Delivery Information -->
          <div class="order-info-box">
            <div class="order-box-heading">👤 Complete Customer &amp; Delivery Details</div>
            <div class="buyer-kv-grid">
              <div class="buyer-kv">
                <strong>Customer Full Name</strong>
                <span>${escapeHtml(buyerName)}</span>
              </div>
              <div class="buyer-kv">
                <strong>Phone / WhatsApp</strong>
                <span>${escapeHtml(buyerPhone)}</span>
              </div>
              <div class="buyer-kv">
                <strong>Email Address</strong>
                <span>${escapeHtml(buyerEmail)}</span>
              </div>
              <div class="buyer-kv">
                <strong>Address Type</strong>
                <span>${escapeHtml(addrType)}</span>
              </div>
              <div class="buyer-kv full">
                <strong>Street / Locality &amp; Landmark</strong>
                <span>${escapeHtml(locality)}</span>
              </div>
              <div class="buyer-kv full">
                <strong>City, State &amp; Pincode</strong>
                <span>${escapeHtml(cityPin)}</span>
              </div>
            </div>
          </div>

          <!-- Itemized Crafts & Financial Breakdown -->
          <div class="order-info-box">
            <div class="order-box-heading">🧶 Ordered Craft Items &amp; Direct Payout</div>
            <div>
              ${(o.items || []).map(item => `
                <div class="order-item-row">
                  <img src="${resolveImgSrc(item.image)}" class="order-item-thumb" alt="${escapeHtml(item.title)}">
                  <div class="order-item-info">
                    <div class="order-item-title">${escapeHtml(item.title)}</div>
                    <div class="order-item-sub">
                      Qty: <strong>${item.qty || 1}</strong> × ${formatINR(item.price)} •
                      GI ID: <code>${escapeHtml(item.giId || "GI-VERIFIED")}</code>
                      ${item.artisan ? ` • Artisan: ${escapeHtml(item.artisan)}` : ""}
                    </div>
                  </div>
                  <div class="order-item-total">${formatINR(item.lineTotal || (item.price * (item.qty || 1)))}</div>
                </div>
              `).join("")}
            </div>
            <div class="order-financial-bar">
              <div>
                Subtotal: <strong>${formatINR(subtotal)}</strong>
                ${discount > 0 ? ` • Discount: <strong style="color: var(--success-600);">−${formatINR(discount)}</strong>` : ""}
                ${o.couponCode ? ` (Code: <code>${escapeHtml(o.couponCode)}</code>)` : ""}
              </div>
              <div style="font-size: 0.92rem;">
                Direct Artisan Payout (100%): <strong style="color: var(--forest-900);">${formatINR(o.artisanPayout || o.total)}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Interactive 5-Stage Fulfillment Controls -->
        <div class="order-box-heading" style="margin-bottom: 8px;">🚚 Update Order Fulfillment Stage (Syncs Live to Buyer Tracker)</div>
        <div class="stage-stepper">
          ${TRACKING_STAGES.map((lbl, idx) => {
            const sNum = idx + 1;
            return `
              <button type="button" class="stage-pill ${sNum <= stage ? "done" : ""}"
                onclick="setOrderStage('${escapeHtml(o.id)}', ${sNum})">
                ${escapeHtml(lbl)}
              </button>
            `;
          }).join("")}
        </div>

        <!-- Seller Dispatch Response / Tracking Note to Buyer -->
        <div class="order-seller-response-row">
          <input type="text" id="note-${escapeHtml(o.id)}" class="field-input"
            value="${escapeHtml(o.sellerNote || "")}"
            placeholder="Send courier AWB tracking ID or personal dispatch note to the buyer...">
          <button type="button" class="btn-forest" onclick="saveSellerOrderNote('${escapeHtml(o.id)}')">
            ✉️ Send Update to Buyer
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function setOrderStage(orderId, stageNum) {
  const orders = getAllOrders();
  const target = orders.find(o => o.id === orderId);
  if (!target) return;
  target.stage = stageNum;
  target.isNewForSeller = false;
  saveStore(STORAGE_KEYS.ORDERS, orders);
  refreshAllData(false);
  showPortalToast(`🚚 Order #${orderId} updated to: ${TRACKING_STAGES[stageNum - 1]}`);
}

function saveSellerOrderNote(orderId) {
  const input = document.getElementById(`note-${orderId}`);
  if (!input) return;
  const note = input.value.trim();
  const orders = getAllOrders();
  const target = orders.find(o => o.id === orderId);
  if (!target) return;
  target.sellerNote = note;
  saveStore(STORAGE_KEYS.ORDERS, orders);
  showPortalToast(`✉️ Dispatch update saved for Order #${orderId} & sent to buyer!`);
}

function simulateIncomingBuyerOrder() {
  const products = getSellerManagedProducts();
  const prod = products[0] || DEMO_SEED_FALLBACK[0];
  const now = new Date();
  const orderId = "HL-ORD-2026-" + Math.floor(1000 + Math.random() * 9000);

  const buyers = [
    { name: "Priya Sharma", phone: "+91 98112 77420", email: "priya.sharma@valleycollector.in", locality: "B-42 Defence Colony, Ring Road", city: "New Delhi", pincode: "110024", addressType: "Home" },
    { name: "Arjun Malhotra", phone: "+91 98201 33915", email: "arjun.m@heritagehomes.in", locality: "14th Floor, Seaface Residency, Worli", city: "Mumbai, Maharashtra", pincode: "400018", addressType: "Office" },
    { name: "Meera Nair", phone: "+91 98450 61890", email: "meera.nair@designcraft.in", locality: "72 Indiranagar 100ft Road", city: "Bengaluru, Karnataka", pincode: "560038", addressType: "Home" }
  ];
  const b = buyers[Math.floor(Math.random() * buyers.length)];

  const newOrder = {
    id: orderId,
    date: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    createdAt: now.toISOString(),
    buyer: {
      ...b,
      fullAddress: `${b.name}, ${b.locality}, ${b.city} - ${b.pincode}`
    },
    items: [
      {
        productId: prod.id,
        title: prod.title,
        qty: 1,
        price: prod.price,
        lineTotal: prod.price,
        giId: prod.giId,
        artisan: prod.artisan,
        guild: prod.guildLabel || prod.guild,
        image: prod.image
      }
    ],
    subtotal: prod.price,
    discount: 0,
    couponCode: null,
    shippingFee: 0,
    total: prod.price,
    artisanPayout: prod.price,
    paymentMethod: "UPI Verified Escrow",
    paymentStatus: "Paid (Escrow Protected)",
    address: `${b.name}, ${b.locality}, ${b.city} - ${b.pincode}`,
    stage: 1,
    sellerNote: "",
    isNewForSeller: true
  };

  const orders = getAllOrders();
  orders.unshift(newOrder);
  saveStore(STORAGE_KEYS.ORDERS, orders);
  refreshAllData(false);
  showPortalToast(`🔔 New Order #${orderId} received from ${b.name} (${formatINR(prod.price)})!`);
}

/* ==========================================================================
   TAB 5: Product Responses, Engagement & Buyer Inquiries
   ========================================================================== */
function renderProductResponses() {
  const kpiWrap = document.getElementById("engagement-kpi-grid");
  const listWrap = document.getElementById("responses-list");
  if (!kpiWrap || !listWrap) return;

  const products = getSellerManagedProducts();
  const wishlist = loadStore(STORAGE_KEYS.WISHLIST, []);
  const cart = loadStore(STORAGE_KEYS.CART, []);
  const reviewsObj = loadStore(STORAGE_KEYS.REVIEWS, {});
  const inquiries = loadStore(STORAGE_KEYS.INQUIRIES, []);

  // Flatten reviews stored by product ID from main storefront
  const allResponses = [...inquiries];
  Object.entries(reviewsObj).forEach(([prodId, arr]) => {
    if (!Array.isArray(arr)) return;
    const prod = products.find(p => p.id === prodId);
    const prodTitle = prod ? prod.title : `Craft (${prodId})`;
    arr.forEach((rev, i) => {
      allResponses.push({
        id: `rev-${prodId}-${i}`,
        sourceKey: prodId,
        sourceIndex: i,
        type: "Verified Buyer Review",
        author: rev.author || "Verified Collector",
        productTitle: prodTitle,
        date: rev.date || "Recent",
        rating: rev.rating || 5,
        comment: rev.comment || "",
        reply: rev.artisanReply || ""
      });
    });
  });

  const avgRating = allResponses.filter(r => r.rating).length
    ? (allResponses.filter(r => r.rating).reduce((s, r) => s + r.rating, 0) / allResponses.filter(r => r.rating).length).toFixed(1)
    : "4.9";

  kpiWrap.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-top"><span class="kpi-label">Wishlist Saves</span><span class="kpi-icon">♡</span></div>
      <div class="kpi-value">${wishlist.length + products.length * 14}</div>
      <div class="kpi-sub">Buyers bookmarking your crafts</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top"><span class="kpi-label">Active Shopping Bags</span><span class="kpi-icon">🛍️</span></div>
      <div class="kpi-value">${cart.reduce((s, c) => s + (c.qty || 1), 0) + 2}</div>
      <div class="kpi-sub">Live buyer purchase intent</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top"><span class="kpi-label">Average Craft Rating</span><span class="kpi-icon">★</span></div>
      <div class="kpi-value">${avgRating} / 5</div>
      <div class="kpi-sub">Verified GI authenticity feedback</div>
    </div>
  `;

  if (!allResponses.length) {
    listWrap.innerHTML = `<p style="text-align: center; padding: 30px; color: var(--text-500);">No buyer responses yet.</p>`;
    return;
  }

  listWrap.innerHTML = allResponses.map(r => `
    <div class="response-card">
      <div class="response-head">
        <div>
          <div class="response-author">
            ${escapeHtml(r.author)}
            ${r.rating ? `<span style="color: var(--gold-600); margin-left: 6px;">${"★".repeat(r.rating)}</span>` : ""}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-500);">${escapeHtml(r.type)} • ${escapeHtml(r.date)}</div>
        </div>
        <span class="response-product-tag">🧶 ${escapeHtml(r.productTitle)}</span>
      </div>
      <p class="response-comment">"${escapeHtml(r.comment)}"</p>
      ${r.reply ? `
        <div class="artisan-reply-box">
          <strong>✦ Your Artisan Reply:</strong> ${escapeHtml(r.reply)}
        </div>
      ` : ""}
      <form class="reply-form-row" onsubmit="submitArtisanReply(event, '${escapeHtml(r.id)}', '${escapeHtml(r.sourceKey || "")}', ${r.sourceIndex ?? -1})">
        <input type="text" id="reply-input-${escapeHtml(r.id)}" class="field-input"
          placeholder="${r.reply ? "Update your reply..." : "Write your official artisan response to this buyer..."}" required>
        <button type="submit" class="btn-forest">💬 ${r.reply ? "Update Reply" : "Send Reply"}</button>
      </form>
    </div>
  `).join("");
}

function submitArtisanReply(e, respId, sourceKey, sourceIndex) {
  e.preventDefault();
  const input = document.getElementById(`reply-input-${respId}`);
  const replyText = (input?.value || "").trim();
  if (!replyText) return;

  if (sourceKey && sourceIndex >= 0) {
    const reviewsObj = loadStore(STORAGE_KEYS.REVIEWS, {});
    if (reviewsObj[sourceKey] && reviewsObj[sourceKey][sourceIndex]) {
      reviewsObj[sourceKey][sourceIndex].artisanReply = replyText;
      saveStore(STORAGE_KEYS.REVIEWS, reviewsObj);
    }
  } else {
    const inquiries = loadStore(STORAGE_KEYS.INQUIRIES, []);
    const item = inquiries.find(i => i.id === respId);
    if (item) {
      item.reply = replyText;
      saveStore(STORAGE_KEYS.INQUIRIES, inquiries);
    }
  }

  refreshAllData(false);
  showPortalToast("✓ Your artisan response has been published!");
}

function simulateBuyerResponse() {
  const products = getSellerManagedProducts();
  const prod = products[0] || DEMO_SEED_FALLBACK[0];
  const inquiries = loadStore(STORAGE_KEYS.INQUIRIES, []);

  inquiries.unshift({
    id: "inq-" + Date.now(),
    type: "Buyer Question",
    author: "Rhea Deshmukh (Pune)",
    productTitle: prod.title,
    date: "Just now",
    rating: 5,
    comment: `Hi ${PortalState.seller?.name || "Ustad ji"}, I loved "${prod.title}"! Can you include a gift card and confirm dispatch time to Pune?`,
    reply: ""
  });
  saveStore(STORAGE_KEYS.INQUIRIES, inquiries);
  refreshAllData(false);
  showPortalToast("💬 New buyer inquiry received on your product!");
}

/* Boot Seller Portal */
window.addEventListener("DOMContentLoaded", initPortal);

