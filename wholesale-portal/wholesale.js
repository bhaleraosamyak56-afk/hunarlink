/* ==========================================================================
   HunarLink — Wholesale Trade Portal Controller
   1. Bulk Buyer -> Transfers buyer info directly to Specified HunarLink Artisan
   2. Local Seller -> Transfers local seller info directly to HunarLink Admin
   ========================================================================== */

const WHOLESALE_KEYS = {
  SELLER_REQUESTS: "hunarlink_wholesale_seller_requests",
  ADMIN_REQUESTS: "hunarlink_wholesale_admin_requests",
  SELLER_INQUIRIES: "hunarlink_seller_inquiries",
  BUYER_PROFILE: "hunarlink_buyer_profile",
  ADDRESSES: "hunarlink_addresses"
};

const WHOLESALE_FALLBACK_PRODUCTS = [
  {
    id: "hl-pash-001",
    title: "Royal Khudrang Pashmina Shawl",
    guild: "pashmina",
    guildLabel: "Pashmina & Kani Guild",
    artisan: "Master Ghulam Qadir Mir",
    district: "Srinagar",
    price: 1650,
    giId: "GI-JK-PASH-8821",
    image: "assets/products/pashmina_01.jpg"
  },
  {
    id: "hl-waln-001",
    title: "Openwork Chinar Lattice Walnut Chest",
    guild: "walnut",
    guildLabel: "Walnut Woodcarving",
    artisan: "Fayaz Ahmad Wani",
    district: "Anantnag",
    price: 14800,
    giId: "GI #JK-WNT-1180",
    image: "assets/products/walnut_01.jpg"
  },
  {
    id: "hl-papr-001",
    title: "Shahi Gulab-dan Urn",
    guild: "papier-mache",
    guildLabel: "Papier-Mâché Art",
    artisan: "Master Ali Mohammad",
    district: "Srinagar",
    price: 850,
    giId: "GI-JK-PAPR-3109",
    image: "assets/products/papier_01.jpg"
  }
];

const WholesaleState = {
  category: "all",
  selectedProductId: null
};

function wpLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function wpSave(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

function wpEsc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wpINR(num) {
  return "₹" + Math.round(Number(num) || 0).toLocaleString("en-IN");
}

function wpResolveImg(path) {
  if (!path) return "../assets/products/pashmina_01.jpg";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://") || path.startsWith("../")) {
    return path;
  }
  return "../" + path.replace(/^\.?\//, "");
}

function wpToast(msg) {
  const el = document.getElementById("wp-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(wpToast._t);
  wpToast._t = setTimeout(() => el.classList.remove("show"), 3600);
}

function getWholesaleCatalog() {
  if (typeof getAllProducts === "function") {
    const list = getAllProducts();
    if (Array.isArray(list) && list.length) return list;
  }
  return WHOLESALE_FALLBACK_PRODUCTS;
}

function getSelectedProduct() {
  const catalog = getWholesaleCatalog();
  return catalog.find(p => p.id === WholesaleState.selectedProductId) || catalog[0];
}

function getTierDiscount(qty) {
  const q = Math.max(10, Number(qty) || 10);
  if (q >= 50) return 25;
  if (q >= 25) return 18;
  return 12;
}

/* ==========================================================================
   Tab Switching
   ========================================================================== */
function switchWholesaleTab(tabName) {
  const valid = ["buyer", "local-seller", "tracker"];
  const target = valid.includes(tabName) ? tabName : "buyer";

  valid.forEach(t => {
    const btn = document.getElementById("tab-btn-" + t);
    const panel = document.getElementById("panel-" + t);
    if (btn) btn.classList.toggle("active", t === target);
    if (panel) panel.classList.toggle("active", t === target);
  });

  if (target === "tracker") {
    renderLiveTransferDesk();
  }
}

/* ==========================================================================
   TAB 1: Product Picker, Specified Artisan Routing & Bulk Calculator
   ========================================================================== */
function setWholesaleCategory(cat) {
  WholesaleState.category = cat;
  document.querySelectorAll("#wp-cat-pills .wp-cat-pill").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-cat") === cat);
  });
  renderProductSelector();
}

function selectWholesaleProduct(prodId) {
  WholesaleState.selectedProductId = prodId;
  renderProductSelector();
  renderSelectedArtisanBox();
  updateBulkCalculation();
}

function renderProductSelector() {
  const listEl = document.getElementById("wp-product-list");
  if (!listEl) return;

  const query = (document.getElementById("wp-product-search")?.value || "").trim().toLowerCase();
  const catalog = getWholesaleCatalog();

  const filtered = catalog.filter(p => {
    const catOk = WholesaleState.category === "all" || p.guild === WholesaleState.category;
    if (!catOk) return false;
    if (!query) return true;
    const hay = `${p.title} ${p.artisan} ${p.district} ${p.giId} ${p.guildLabel}`.toLowerCase();
    return hay.includes(query);
  });

  if (!filtered.length) {
    listEl.innerHTML = `<div class="wp-empty">No crafts matched "${wpEsc(query)}". Try another keyword or category.</div>`;
    return;
  }

  if (!WholesaleState.selectedProductId) {
    WholesaleState.selectedProductId = filtered[0].id;
  }

  listEl.innerHTML = filtered.slice(0, 40).map(p => {
    const isSel = p.id === WholesaleState.selectedProductId;
    return `
      <button type="button" class="wp-prod-option ${isSel ? "selected" : ""}" onclick="selectWholesaleProduct('${wpEsc(p.id)}')">
        <img src="${wpResolveImg(p.image)}" alt="${wpEsc(p.title)}" class="wp-prod-thumb">
        <div class="wp-prod-meta">
          <div class="wp-prod-title">${wpEsc(p.title)}</div>
          <div class="wp-prod-artisan">🔨 Artisan: ${wpEsc(p.artisan)} (${wpEsc(p.district)})</div>
          <div class="wp-prod-sub">${wpEsc(p.guildLabel || p.guild)} • ${wpEsc(p.giId)} • Retail ${wpINR(p.price)}</div>
        </div>
      </button>
    `;
  }).join("");
}

function renderSelectedArtisanBox() {
  const box = document.getElementById("wp-seller-target-box");
  const submitBtn = document.getElementById("bw-submit-btn");
  const subtitle = document.getElementById("buyer-routing-subtitle");
  const p = getSelectedProduct();
  if (!box || !p) return;

  box.innerHTML = `
    <div class="wp-target-badge">⚡ Direct Routing → Specified HunarLink Seller (Artisan)</div>
    <div class="wp-target-header">
      <img src="${wpResolveImg(p.image)}" alt="${wpEsc(p.title)}" class="wp-target-img">
      <div>
        <div class="wp-target-name">${wpEsc(p.title)}</div>
        <div class="wp-target-artisan-row">
          Specified Seller: <strong>${wpEsc(p.artisan)}</strong> • ${wpEsc(p.district)}, J&amp;K
        </div>
        <div class="wp-target-artisan-row">
          GI Tag: <code>${wpEsc(p.giId)}</code> • Guild: ${wpEsc(p.guildLabel || p.guild)}
        </div>
      </div>
    </div>
  `;

  if (submitBtn) {
    submitBtn.textContent = `📤 Transfer Bulk Request to ${p.artisan} →`;
  }
  if (subtitle) {
    subtitle.innerHTML = `Your complete buyer information will be transferred directly to <strong>${wpEsc(p.artisan)}</strong> (${wpEsc(p.district)}) regarding <strong>${wpEsc(p.title)}</strong>.`;
  }
}

function updateBulkCalculation() {
  const calcEl = document.getElementById("wp-calc-box");
  const p = getSelectedProduct();
  if (!calcEl || !p) return;

  const qtyInput = document.getElementById("bw-qty");
  const qty = Math.max(10, parseInt(qtyInput?.value || "20", 10) || 10);
  const discPct = getTierDiscount(qty);
  const unitRetail = Number(p.price) || 1000;
  const unitWholesale = Math.round(unitRetail * (1 - discPct / 100));
  const totalWholesale = unitWholesale * qty;
  const totalSavings = (unitRetail - unitWholesale) * qty;

  calcEl.innerHTML = `
    <div class="wp-calc-title">📊 Live Wholesale Lot Estimate (${qty} Units • ${discPct}% Guild Tier Discount)</div>
    <div class="wp-calc-grid">
      <div class="wp-calc-cell">
        <div class="wp-calc-label">Wholesale Rate / Unit</div>
        <div class="wp-calc-val accent">${wpINR(unitWholesale)} <span style="font-size:0.72rem;text-decoration:line-through;opacity:0.7;">${wpINR(unitRetail)}</span></div>
      </div>
      <div class="wp-calc-cell">
        <div class="wp-calc-label">Total Estimated Lot Value</div>
        <div class="wp-calc-val">${wpINR(totalWholesale)}</div>
      </div>
      <div class="wp-calc-cell">
        <div class="wp-calc-label">Total Bulk Savings</div>
        <div class="wp-calc-val" style="color:#86EFAC;">−${wpINR(totalSavings)} (${discPct}% Off)</div>
      </div>
      <div class="wp-calc-cell">
        <div class="wp-calc-label">Direct Artisan Payout</div>
        <div class="wp-calc-val">100% Zero-Cut</div>
      </div>
    </div>
  `;
}

function prefillBuyerFromProfile() {
  const profile = wpLoad(WHOLESALE_KEYS.BUYER_PROFILE, null);
  const addresses = wpLoad(WHOLESALE_KEYS.ADDRESSES, []);
  if (profile && profile.isLoggedIn !== false) {
    const nameEl = document.getElementById("bw-name");
    const emailEl = document.getElementById("bw-email");
    const phoneEl = document.getElementById("bw-phone");
    if (nameEl && !nameEl.value) nameEl.value = profile.fullName || "";
    if (emailEl && !emailEl.value) emailEl.value = profile.email || "";
    if (phoneEl && !phoneEl.value) phoneEl.value = profile.phone || "";
  }
  if (Array.isArray(addresses) && addresses.length) {
    const addr = addresses[0];
    const cityEl = document.getElementById("bw-city");
    const pinEl = document.getElementById("bw-pincode");
    if (cityEl && !cityEl.value && addr.city && addr.city !== "Sample City") cityEl.value = addr.city;
    if (pinEl && !pinEl.value && addr.pincode && addr.pincode !== "000000") pinEl.value = addr.pincode;
  }
}

function submitBuyerWholesale(e) {
  e.preventDefault();
  const p = getSelectedProduct();
  if (!p) return;

  const qty = Math.max(10, parseInt(document.getElementById("bw-qty").value, 10) || 10);
  const discPct = getTierDiscount(qty);
  const unitRetail = Number(p.price) || 1000;
  const unitWholesale = Math.round(unitRetail * (1 - discPct / 100));
  const totalLotValue = unitWholesale * qty;

  const now = new Date();
  const reqId = "HL-WHL-2026-" + Math.floor(1000 + Math.random() * 9000);

  const buyerName = document.getElementById("bw-name").value.trim();
  const buyerCompany = document.getElementById("bw-company").value.trim() || "Individual Bulk Collector";
  const buyerPhone = document.getElementById("bw-phone").value.trim();
  const buyerEmail = document.getElementById("bw-email").value.trim();
  const buyerCity = document.getElementById("bw-city").value.trim();
  const buyerPincode = document.getElementById("bw-pincode").value.trim();
  const buyerGstin = document.getElementById("bw-gstin").value.trim() || "N/A";
  const buyerType = document.getElementById("bw-buyer-type").value;
  const targetDate = document.getElementById("bw-target-date").value || "Flexible";
  const notes = document.getElementById("bw-notes").value.trim() || "Standard GI-certified bulk lot packaging.";

  const record = {
    id: reqId,
    routedTo: "seller",
    createdAt: now.toISOString(),
    date: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    status: "Transferred to HunarLink Artisan",
    sellerReply: "",
    // Specified HunarLink Seller (Artisan) & Particular Product
    productId: p.id,
    productTitle: p.title,
    productImage: p.image,
    guildLabel: p.guildLabel || p.guild,
    giId: p.giId,
    sellerName: p.artisan,
    sellerDistrict: p.district,
    // Complete Buyer Information
    buyer: {
      name: buyerName,
      company: buyerCompany,
      phone: buyerPhone,
      email: buyerEmail,
      city: buyerCity,
      pincode: buyerPincode,
      gstin: buyerGstin,
      buyerType
    },
    // Bulk Lot Financials
    qty,
    discountPct: discPct,
    unitRetail,
    unitWholesale,
    totalLotValue,
    targetDate,
    notes
  };

  // 1. Save to dedicated Seller Wholesale Queue
  const sellerReqs = wpLoad(WHOLESALE_KEYS.SELLER_REQUESTS, []);
  sellerReqs.unshift(record);
  wpSave(WHOLESALE_KEYS.SELLER_REQUESTS, sellerReqs);

  // 2. Also mirror into Seller Portal Product Responses / Inquiries so artisan sees it in both places
  const inquiries = wpLoad(WHOLESALE_KEYS.SELLER_INQUIRIES, []);
  inquiries.unshift({
    id: "inq-whl-" + Date.now(),
    type: `Wholesale Bulk Request (${qty} Units → ${p.artisan})`,
    author: `${buyerName} (${buyerCompany}, ${buyerCity})`,
    productTitle: p.title,
    date: `${record.date}, ${record.time}`,
    rating: 5,
    comment: `Bulk Order Ref ${reqId}: ${qty} units @ ${wpINR(unitWholesale)}/unit (Total ${wpINR(totalLotValue)}). Contact: ${buyerPhone} | ${buyerEmail}. Notes: ${notes}`,
    reply: ""
  });
  wpSave(WHOLESALE_KEYS.SELLER_INQUIRIES, inquiries);

  // Render Transfer Receipt
  const receipt = document.getElementById("buyer-receipt");
  if (receipt) {
    receipt.innerHTML = `
      <div class="wp-receipt-title">✅ Buyer Details Transferred to Specified HunarLink Seller!</div>
      <p style="font-size:0.82rem;color:#14532D;">
        Reference <strong>${wpEsc(reqId)}</strong> has been routed directly to <strong>${wpEsc(p.artisan)}</strong> (${wpEsc(p.district)}) for <strong>${wpEsc(p.title)}</strong>.
      </p>
      <div class="wp-receipt-grid">
        <div><strong>Target Artisan:</strong> ${wpEsc(p.artisan)}</div>
        <div><strong>Product &amp; GI:</strong> ${wpEsc(p.title)} (${wpEsc(p.giId)})</div>
        <div><strong>Buyer:</strong> ${wpEsc(buyerName)} (${wpEsc(buyerCompany)})</div>
        <div><strong>Buyer Contact:</strong> ${wpEsc(buyerPhone)} • ${wpEsc(buyerEmail)}</div>
        <div><strong>Bulk Quantity:</strong> ${qty} Units (${discPct}% Off)</div>
        <div><strong>Est. Lot Value:</strong> ${wpINR(totalLotValue)}</div>
      </div>
      <div class="wp-receipt-actions">
        <a href="../seller-portal/dashboard.html?tab=wholesale" class="wp-btn-sm">🔨 View in Seller Portal →</a>
        <button type="button" class="wp-btn-sm outline" onclick="switchWholesaleTab('tracker')">📡 Open Live Routing Desk</button>
      </div>
    `;
    receipt.classList.add("show");
    receipt.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  updateCounts();
  wpToast(`📤 Bulk request ${reqId} transferred to ${p.artisan}!`);
}

/* ==========================================================================
   TAB 2: Local Seller Wholesale Supply -> Transferred to HunarLink Admin
   ========================================================================== */
function submitLocalSellerWholesale(e) {
  e.preventDefault();
  const now = new Date();
  const refId = "HL-ADM-WHL-2026-" + Math.floor(1000 + Math.random() * 9000);

  const record = {
    id: refId,
    routedTo: "admin",
    recipient: "HunarLink Admin Trade Desk",
    createdAt: now.toISOString(),
    date: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    status: "Transferred to HunarLink Admin",
    adminNote: "",
    sellerName: document.getElementById("ls-name").value.trim(),
    workshopName: document.getElementById("ls-workshop").value.trim(),
    sellerCategory: document.getElementById("ls-type").value,
    district: document.getElementById("ls-district").value,
    phone: document.getElementById("ls-phone").value.trim(),
    email: document.getElementById("ls-email").value.trim(),
    address: document.getElementById("ls-address").value.trim(),
    guild: document.getElementById("ls-guild").value,
    productOffered: document.getElementById("ls-product").value.trim(),
    supplyCapacity: parseInt(document.getElementById("ls-capacity").value, 10) || 10,
    wholesaleRate: parseInt(document.getElementById("ls-rate").value, 10) || 500,
    giStatus: document.getElementById("ls-gi-status").value,
    notes: document.getElementById("ls-notes").value.trim() || "Samples available on Admin request."
  };

  const adminReqs = wpLoad(WHOLESALE_KEYS.ADMIN_REQUESTS, []);
  adminReqs.unshift(record);
  wpSave(WHOLESALE_KEYS.ADMIN_REQUESTS, adminReqs);

  const receipt = document.getElementById("admin-receipt");
  if (receipt) {
    receipt.innerHTML = `
      <div class="wp-receipt-title">🛡️ Local Seller Information Transferred to HunarLink Admin!</div>
      <p style="font-size:0.82rem;color:#14532D;">
        Admin Reference <strong>${wpEsc(refId)}</strong> has been delivered to the <strong>HunarLink Admin Trade Desk</strong> for verification &amp; wholesale buyer matching.
      </p>
      <div class="wp-receipt-grid">
        <div><strong>Recipient:</strong> HunarLink Admin Trade Desk</div>
        <div><strong>Local Seller:</strong> ${wpEsc(record.sellerName)} (${wpEsc(record.workshopName)})</div>
        <div><strong>Category &amp; District:</strong> ${wpEsc(record.sellerCategory)} • ${wpEsc(record.district)}</div>
        <div><strong>Contact:</strong> ${wpEsc(record.phone)} • ${wpEsc(record.email)}</div>
        <div><strong>Craft Offered:</strong> ${wpEsc(record.productOffered)} (${record.supplyCapacity} units)</div>
        <div><strong>Wholesale Rate:</strong> ${wpINR(record.wholesaleRate)} / unit</div>
      </div>
      <div class="wp-receipt-actions">
        <button type="button" class="wp-btn-sm" onclick="switchWholesaleTab('tracker')">🛡️ View in HunarLink Admin Desk →</button>
      </div>
    `;
    receipt.classList.add("show");
    receipt.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  document.getElementById("local-seller-form").reset();
  updateCounts();
  wpToast(`🛡️ Local seller submission ${refId} transferred to HunarLink Admin!`);
}

/* ==========================================================================
   TAB 3: Live Transfer & Routing Desk
   ========================================================================== */
function renderLiveTransferDesk() {
  const sellerReqs = wpLoad(WHOLESALE_KEYS.SELLER_REQUESTS, []);
  const adminReqs = wpLoad(WHOLESALE_KEYS.ADMIN_REQUESTS, []);

  const sellerWrap = document.getElementById("seller-queue-list");
  const adminWrap = document.getElementById("admin-queue-list");
  const sellerCount = document.getElementById("seller-queue-count");
  const adminCount = document.getElementById("admin-queue-count");

  if (sellerCount) sellerCount.textContent = sellerReqs.length;
  if (adminCount) adminCount.textContent = adminReqs.length;

  if (sellerWrap) {
    if (!sellerReqs.length) {
      sellerWrap.innerHTML = `<div class="wp-empty">No bulk buyer requests yet. Submit one in the "Bulk Buyer" tab to transfer buyer info directly to a specified HunarLink artisan.</div>`;
    } else {
      sellerWrap.innerHTML = sellerReqs.map(r => `
        <div class="wp-req-item seller-item">
          <div class="wp-req-top">
            <div>
              <div class="wp-req-id">${wpEsc(r.id)} • ${wpEsc(r.date)} ${wpEsc(r.time || "")}</div>
              <div class="wp-req-title">${wpEsc(r.productTitle)} (${r.qty} Units)</div>
            </div>
            <span class="wp-status-pill ${/accept|quoted|ready/i.test(r.status) ? "approved" : ""}">${wpEsc(r.status)}</span>
          </div>
          <div class="wp-req-details">
            <div><strong>Buyer:</strong> ${wpEsc(r.buyer?.name)}</div>
            <div><strong>Company:</strong> ${wpEsc(r.buyer?.company)}</div>
            <div><strong>Phone:</strong> ${wpEsc(r.buyer?.phone)}</div>
            <div><strong>Email:</strong> ${wpEsc(r.buyer?.email)}</div>
            <div><strong>Location:</strong> ${wpEsc(r.buyer?.city)} - ${wpEsc(r.buyer?.pincode)}</div>
            <div><strong>Lot Total:</strong> ${wpINR(r.totalLotValue)} (${r.discountPct}% Off)</div>
          </div>
          <div class="wp-req-target-strip">
            ⚡ Transferred to Specified HunarLink Seller: ${wpEsc(r.sellerName)} (${wpEsc(r.sellerDistrict)}) • GI: ${wpEsc(r.giId)}
          </div>
          ${r.sellerReply ? `<div style="margin-top:8px;font-size:0.78rem;color:#166534;background:#ECFDF5;padding:7px 10px;border-radius:6px;"><strong>✦ Artisan Response:</strong> ${wpEsc(r.sellerReply)}</div>` : ""}
        </div>
      `).join("");
    }
  }

  if (adminWrap) {
    if (!adminReqs.length) {
      adminWrap.innerHTML = `<div class="wp-empty">No local seller wholesale submissions yet. Submit one in the "Local Seller" tab to transfer info directly to HunarLink Admin.</div>`;
    } else {
      adminWrap.innerHTML = adminReqs.map(a => `
        <div class="wp-req-item admin-item">
          <div class="wp-req-top">
            <div>
              <div class="wp-req-id">${wpEsc(a.id)} • ${wpEsc(a.date)} ${wpEsc(a.time || "")}</div>
              <div class="wp-req-title">${wpEsc(a.productOffered)} (${a.supplyCapacity} Units)</div>
            </div>
            <span class="wp-status-pill ${/approved/i.test(a.status) ? "approved" : "admin"}">${wpEsc(a.status)}</span>
          </div>
          <div class="wp-req-details">
            <div><strong>Local Seller:</strong> ${wpEsc(a.sellerName)}</div>
            <div><strong>Workshop:</strong> ${wpEsc(a.workshopName)}</div>
            <div><strong>Phone:</strong> ${wpEsc(a.phone)}</div>
            <div><strong>Email:</strong> ${wpEsc(a.email)}</div>
            <div><strong>District:</strong> ${wpEsc(a.district)} (${wpEsc(a.sellerCategory)})</div>
            <div><strong>Wholesale Rate:</strong> ${wpINR(a.wholesaleRate)} / unit</div>
          </div>
          <div style="font-size:0.76rem;color:var(--text-500);margin-bottom:6px;">
            <strong>GI Status:</strong> ${wpEsc(a.giStatus)} • <strong>Address:</strong> ${wpEsc(a.address)}
          </div>
          <div class="wp-req-target-strip admin">
            🛡️ Routed to: HunarLink Admin Trade Desk
          </div>
          <div class="wp-admin-actions">
            <button type="button" class="wp-btn-sm" onclick="updateAdminRequestStatus('${wpEsc(a.id)}', 'Approved by Admin — Onboarding')">✅ Approve &amp; Onboard</button>
            <button type="button" class="wp-btn-sm outline" onclick="updateAdminRequestStatus('${wpEsc(a.id)}', 'Cluster Inspection Scheduled')">📍 Schedule Visit</button>
            <button type="button" class="wp-btn-sm outline" onclick="updateAdminRequestStatus('${wpEsc(a.id)}', 'Sample Requested by Admin')">📦 Request Sample</button>
          </div>
        </div>
      `).join("");
    }
  }
}

function updateAdminRequestStatus(reqId, newStatus) {
  const adminReqs = wpLoad(WHOLESALE_KEYS.ADMIN_REQUESTS, []);
  const target = adminReqs.find(x => x.id === reqId);
  if (!target) return;
  target.status = newStatus;
  wpSave(WHOLESALE_KEYS.ADMIN_REQUESTS, adminReqs);
  renderLiveTransferDesk();
  wpToast(`🛡️ HunarLink Admin updated ${reqId} → ${newStatus}`);
}

function updateCounts() {
  const sellerCount = wpLoad(WHOLESALE_KEYS.SELLER_REQUESTS, []).length;
  const adminCount = wpLoad(WHOLESALE_KEYS.ADMIN_REQUESTS, []).length;
  const total = sellerCount + adminCount;
  const navEl = document.getElementById("nav-total-requests");
  const tabEl = document.getElementById("tab-tracker-count");
  if (navEl) navEl.textContent = total;
  if (tabEl) tabEl.textContent = total;
}

/* ==========================================================================
   Init
   ========================================================================== */
function initWholesalePortal() {
  const params = new URLSearchParams(window.location.search);
  const prodParam = params.get("product");
  const roleParam = params.get("role") || params.get("mode");

  const catalog = getWholesaleCatalog();
  if (prodParam && catalog.some(p => p.id === prodParam)) {
    WholesaleState.selectedProductId = prodParam;
  } else if (catalog.length) {
    WholesaleState.selectedProductId = catalog[0].id;
  }

  renderProductSelector();
  renderSelectedArtisanBox();
  updateBulkCalculation();
  prefillBuyerFromProfile();
  updateCounts();

  if (roleParam === "local-seller" || roleParam === "seller") {
    switchWholesaleTab("local-seller");
  } else if (roleParam === "tracker" || roleParam === "admin") {
    switchWholesaleTab("tracker");
  } else {
    switchWholesaleTab("buyer");
  }

  window.addEventListener("storage", (ev) => {
    if (ev.key === WHOLESALE_KEYS.SELLER_REQUESTS || ev.key === WHOLESALE_KEYS.ADMIN_REQUESTS) {
      updateCounts();
      renderLiveTransferDesk();
    }
  });
}

window.addEventListener("DOMContentLoaded", initWholesalePortal);
