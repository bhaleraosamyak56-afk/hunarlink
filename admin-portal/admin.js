/**
 * HunarLink Master Admin Control Center
 * Complete JavaScript Client interacting with live FastAPI Backend APIs
 */

const API_BASE = "http://127.0.0.1:8000/api/v1";

const AdminApp = {
  token: localStorage.getItem("hunarlink_admin_token") || null,
  activeLotId: 1,

  async init() {
    this.bindEvents();

    if (!this.token) {
      // Auto-authenticate as default Super Admin for smooth local evaluation
      await this.loginAdmin("admin@hunarlink.com", "AdminPass@123");
    } else {
      this.loadAllDashboardData();
    }
  },

  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const tabId = link.getAttribute("data-tab");
        this.switchTab(tabId, link);
      });
    });

    // Refresh Button
    document.getElementById("btn-refresh-data")?.addEventListener("click", () => {
      this.loadAllDashboardData();
    });

    // Logout
    document.getElementById("btn-logout")?.addEventListener("click", () => {
      localStorage.removeItem("hunarlink_admin_token");
      this.token = null;
      document.getElementById("admin-login-modal").style.display = "flex";
    });

    // Login Form Submit
    document.getElementById("admin-login-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const id = document.getElementById("login-identifier").value.trim();
      const pw = document.getElementById("login-password").value.trim();
      await this.loginAdmin(id, pw);
    });

    // Customer Search Filter
    document.getElementById("customer-search-input")?.addEventListener("input", e => {
      this.loadCustomers(e.target.value.trim());
    });

    // Seller Status Filter
    document.getElementById("seller-status-filter")?.addEventListener("change", e => {
      this.loadSellers(e.target.value);
    });

    // Trigger GI LLM Audit
    document.getElementById("btn-trigger-test-gi")?.addEventListener("click", () => {
      this.triggerTestGIAudit();
    });

    // Run Dealer Matching Algorithm
    document.getElementById("btn-run-matching")?.addEventListener("click", () => {
      this.runDealerMatchingAlgorithm(this.activeLotId);
    });
  },

  switchTab(tabId, linkElement) {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));

    linkElement.classList.add("active");
    const targetPane = document.getElementById(tabId);
    if (targetPane) {
      targetPane.classList.add("active");
      const title = linkElement.textContent.replace(/^[^\s]+\s/, "");
      document.getElementById("breadcrumb-title").textContent = title;
    }
  },

  async fetchApi(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        document.getElementById("admin-login-modal").style.display = "flex";
        throw new Error("Administrative session expired or unauthorized.");
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      document.getElementById("connection-pill").textContent = "● API Offline / Check Backend";
      document.getElementById("connection-pill").className = "badge badge-warning";
      throw err;
    }
  },

  async loginAdmin(identifier, password) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        this.token = data.access_token;
        localStorage.setItem("hunarlink_admin_token", this.token);
        document.getElementById("admin-login-modal").style.display = "none";
        document.getElementById("connection-pill").textContent = "● API Connected (localhost:8000)";
        document.getElementById("connection-pill").className = "badge badge-success";
        this.loadAllDashboardData();
      } else {
        alert("Authentication failed: " + (data.message || data.detail || "Invalid credentials"));
      }
    } catch (e) {
      console.warn("Could not reach backend:", e);
      document.getElementById("admin-login-modal").style.display = "flex";
    }
  },

  async loadAllDashboardData() {
    this.loadMetrics();
    this.loadCustomers();
    this.loadSellers();
    this.loadGIAudits();
    this.loadNonGIVerifications();
    this.loadSupplierLots();
    this.loadDealers();
    this.loadWholesaleListings();
    this.loadPlatformSettings();
    this.loadAuditLogs();
    this.loadAdminRoles();
  },

  async loadMetrics() {
    try {
      const res = await this.fetchApi("/admin/dashboard/metrics");
      if (res.kpis) {
        const k = res.kpis;
        document.getElementById("kpi-retail-gmv").textContent = `₹${k.financials.retail_gmv.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        document.getElementById("kpi-wholesale-gmv").textContent = `₹${k.financials.wholesale_gmv.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        document.getElementById("kpi-platform-revenue").textContent = `₹${k.financials.platform_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        document.getElementById("kpi-verified-sellers").textContent = k.users.approved_sellers;
        document.getElementById("kpi-pending-gi").textContent = k.pending_actions.pending_gi_verifications;
        document.getElementById("kpi-pending-lots").textContent = k.pending_actions.pending_supplier_lots;

        document.getElementById("stat-retail-prods").textContent = k.catalog.retail_products;
        document.getElementById("stat-customers").textContent = k.users.total_customers;
        document.getElementById("stat-wholesale-listings").textContent = k.catalog.wholesale_listings;
        document.getElementById("stat-wholesale-buyers").textContent = k.users.total_wholesale_buyers;
        document.getElementById("stat-suppliers").textContent = k.users.total_suppliers;
        document.getElementById("stat-dealers").textContent = k.users.total_dealers;
      }
    } catch (e) {
      console.error(e);
    }
  },

  async loadCustomers(search = "") {
    try {
      const url = search ? `/admin/customers?search=${encodeURIComponent(search)}` : "/admin/customers";
      const customers = await this.fetchApi(url);
      const tbody = document.getElementById("customers-tbody");
      if (!customers || customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No customers found.</td></tr>`;
        return;
      }
      tbody.innerHTML = customers.map(c => `
        <tr>
          <td><strong>#${c.user_id}</strong></td>
          <td>${c.first_name} ${c.last_name || ""}</td>
          <td>${c.email}</td>
          <td>${c.phone || "—"}</td>
          <td><span class="badge badge-neutral">${c.addresses_count} saved</span></td>
          <td>
            <span class="badge ${c.account_status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}">${c.account_status}</span>
          </td>
          <td>
            ${c.account_status === 'ACTIVE' 
              ? `<button class="btn btn-outline-sm btn-sm" onclick="AdminApp.toggleCustomerStatus(${c.user_id}, 'SUSPENDED')">Suspend</button>`
              : `<button class="btn btn-primary btn-sm" onclick="AdminApp.toggleCustomerStatus(${c.user_id}, 'ACTIVE')">Reinstate</button>`}
          </td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async toggleCustomerStatus(userId, newStatus) {
    if (!confirm(`Are you sure you want to change customer #${userId} status to ${newStatus}?`)) return;
    await this.fetchApi(`/admin/customers/${userId}/status`, {
      method: "PUT",
      body: JSON.stringify({ account_status: newStatus, reason: "Administrative review via control dashboard." })
    });
    this.loadCustomers();
    this.loadMetrics();
  },

  async loadSellers(statusFilter = "") {
    try {
      const url = statusFilter ? `/admin/sellers?status_filter=${statusFilter}` : "/admin/sellers";
      const sellers = await this.fetchApi(url);
      const tbody = document.getElementById("sellers-tbody");
      if (!sellers || sellers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No sellers in this view.</td></tr>`;
        return;
      }
      tbody.innerHTML = sellers.map(s => `
        <tr>
          <td><strong>#${s.seller_id}</strong></td>
          <td><strong>${s.store_name}</strong></td>
          <td>${s.craft_specialty}</td>
          <td>${s.has_gi_certification ? `<span class="badge badge-gold">✓ ${s.gi_authorized_user_number || 'GI Certified'}</span>` : `<span class="badge badge-neutral">Standard Craft</span>`}</td>
          <td>★ ${s.average_rating} (${s.total_reviews})</td>
          <td><span class="badge ${s.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}">${s.status}</span></td>
          <td>
            ${s.status === 'APPROVED'
              ? `<button class="btn btn-outline-sm btn-sm" onclick="AdminApp.moderateSeller(${s.seller_id}, 'SUSPENDED')">Suspend</button>`
              : `<button class="btn btn-primary btn-sm" onclick="AdminApp.moderateSeller(${s.seller_id}, 'APPROVED')">Approve Store</button>`}
          </td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async moderateSeller(sellerId, newStatus) {
    const reason = prompt(`Reason for setting seller #${sellerId} to ${newStatus}:`, "Quality inspection and artisan documentation verified.");
    if (!reason) return;
    await this.fetchApi(`/admin/sellers/${sellerId}/moderate`, {
      method: "PUT",
      body: JSON.stringify({ status: newStatus, reason })
    });
    this.loadSellers();
    this.loadMetrics();
  },

  async loadGIAudits() {
    try {
      const audits = await this.fetchApi("/admin/verifications/gi");
      const tbody = document.getElementById("gi-audits-tbody");
      if (!audits || audits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">No GI audits on record. Click '⚡ Run Test LLM Audit' above to test.</td></tr>`;
        return;
      }
      tbody.innerHTML = audits.map(a => `
        <tr>
          <td><strong>#${a.audit_id}</strong></td>
          <td>${a.applicant_name}</td>
          <td><span class="badge badge-gold">${a.claimed_gi_code}</span></td>
          <td>${a.llm_provider} (${a.model_version || 'v2'})</td>
          <td><strong>${a.confidence_score}%</strong></td>
          <td>${(a.matching_fields || []).map(m => `<span class="badge badge-success">${m}</span>`).join(" ")}</td>
          <td>${(a.mismatching_fields || []).length ? a.mismatching_fields.map(m => `<span class="badge badge-warning">${m}</span>`).join(" ") : 'None'}</td>
          <td><span class="badge ${a.admin_decision === 'APPROVED_BY_ADMIN' ? 'badge-success' : 'badge-warning'}">${a.admin_decision}</span></td>
          <td>
            ${a.admin_decision === 'PENDING_HUMAN_REVIEW' ? `
              <button class="btn btn-primary btn-sm" onclick="AdminApp.decideGIVerification(${a.audit_id}, 'APPROVED_BY_ADMIN')">Approve GI</button>
              <button class="btn btn-outline-sm btn-sm" onclick="AdminApp.decideGIVerification(${a.audit_id}, 'REJECTED_BY_ADMIN')">Reject</button>
            ` : 'Completed'}
          </td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async triggerTestGIAudit() {
    const payload = {
      target_type: "SELLER",
      target_id: 2,
      applicant_name: "Ghulam Nabi Mir (Zadibal Weavers)",
      claimed_gi_code: "GI-JK-PASH-8821",
      craft_category: "Kashmir Pashmina",
      cluster: "Srinagar / Downtown"
    };
    alert("Sending applicant claim to LLM Craft Auditor Service...");
    const res = await this.fetchApi("/admin/verifications/gi/run-audit", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    alert(`LLM Audit Completed!\nConfidence Score: ${res.confidence_score}%\nReasoning: ${res.reasoning_summary}`);
    this.loadGIAudits();
    this.loadMetrics();
  },

  async decideGIVerification(auditId, decision) {
    const notes = prompt(`Enter official verification decision notes for Audit #${auditId}:`, "Verified against official gazette registry records.");
    if (!notes) return;
    await this.fetchApi(`/admin/verifications/gi/${auditId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, decision_notes: notes })
    });
    alert(`Decision '${decision}' saved with immutable audit log.`);
    this.loadGIAudits();
    this.loadSellers();
    this.loadMetrics();
  },

  async loadNonGIVerifications() {
    try {
      const records = await this.fetchApi("/admin/verifications/non-gi");
      const tbody = document.getElementById("non-gi-tbody");
      if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No pending manual document verification cases.</td></tr>`;
        return;
      }
      tbody.innerHTML = records.map(r => `
        <tr>
          <td>#${r.verification_id}</td>
          <td>${r.target_type}</td>
          <td><strong>${r.business_name}</strong></td>
          <td>${r.pan_or_tax_id || 'N/A'}</td>
          <td><span class="badge badge-warning">${r.status}</span></td>
          <td>${r.admin_remarks || 'Awaiting initial inspector review'}</td>
          <td><button class="btn btn-outline-sm btn-sm">Review Docs</button></td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async loadSupplierLots() {
    try {
      const lots = await this.fetchApi("/admin/procurement/lots");
      const tbody = document.getElementById("lots-tbody");
      if (!lots || lots.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">No supplier product lots submitted.</td></tr>`;
        return;
      }
      tbody.innerHTML = lots.map(l => `
        <tr>
          <td><strong>${l.lot_number}</strong></td>
          <td>${l.supplier_name}</td>
          <td><strong>${l.craft_title}</strong></td>
          <td>${l.is_gi_tagged ? `<span class="badge badge-gold">GI Certified</span>` : 'Standard'}</td>
          <td>${l.quantity_available} ${l.unit_of_measure}</td>
          <td>₹${l.expected_unit_price.toLocaleString("en-IN")}</td>
          <td><strong>₹${l.total_value.toLocaleString("en-IN")}</strong></td>
          <td><span class="badge ${l.status === 'PROCURED' ? 'badge-success' : 'badge-warning'}">${l.status}</span></td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="AdminApp.selectLotForMatching(${l.lot_id}, '${l.craft_title.replace(/'/g, "\\'")}', '${l.lot_number}')">
              Match Dealers →
            </button>
          </td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  selectLotForMatching(lotId, title, lotNumber) {
    this.activeLotId = lotId;
    document.getElementById("active-lot-title").textContent = `${title} (${lotNumber})`;
    const navItem = document.querySelector('[data-tab="tab-procurement"]');
    if (navItem) this.switchTab("tab-procurement", navItem);
    this.runDealerMatchingAlgorithm(lotId);
  },

  async runDealerMatchingAlgorithm(lotId) {
    const container = document.getElementById("matching-results-container");
    const list = document.getElementById("ranked-dealers-list");
    container.style.display = "block";
    list.innerHTML = `<div class="loading-cell">Evaluating dealer specializations, procurement budgets, and transit logistics...</div>`;

    try {
      const res = await this.fetchApi(`/admin/procurement/lots/${lotId}/rank-dealers`);
      if (!res.ranked_dealers || res.ranked_dealers.length === 0) {
        list.innerHTML = `<p>No approved dealers available for this category.</p>`;
        return;
      }
      list.innerHTML = res.ranked_dealers.map((d, index) => `
        <div class="dealer-rank-card">
          <div class="rank-badge">Rank #${index + 1} (${d.ranking_score} pts)</div>
          <h4>${d.dealership_name}</h4>
          <p>Location: <strong>${d.city}</strong> | Rating: <strong>★ ${d.reliability_rating}/5</strong></p>
          <p>Monthly Budget: <strong>₹${d.monthly_budget.toLocaleString("en-IN")}</strong></p>
          <ul style="font-size: 0.78rem; color: #555; margin: 0.5rem 0 1rem 1.2rem;">
            ${d.match_reasons.map(r => `<li>${r}</li>`).join("")}
          </ul>
          <button class="btn btn-primary btn-sm" style="width: 100%;" onclick="AdminApp.assignLotToDealer(${lotId}, ${d.dealer_id}, ${d.ranking_score})">
            Assign Procurement Lot to This Dealer →
          </button>
        </div>
      `).join("");
    } catch (e) {
      list.innerHTML = `<p style="color: red;">Error computing dealer rankings.</p>`;
    }
  },

  async assignLotToDealer(lotId, dealerId, score) {
    if (!confirm(`Assign Lot #${lotId} to Dealer #${dealerId} with match score ${score}?`)) return;
    const res = await this.fetchApi("/admin/procurement/assign", {
      method: "POST",
      body: JSON.stringify({
        lot_id: lotId,
        dealer_id: dealerId,
        ranking_score: score,
        match_reasons: ["Category match", "Budget verified", "Transit approved"]
      })
    });
    alert(`Assignment successful! Assignment ID: #${res.assignment_id}.\nDealer has been notified to confirm procurement terms.`);
    this.loadSupplierLots();
    this.loadMetrics();
  },

  async loadDealers() {
    try {
      const lots = await this.fetchApi("/admin/procurement/lots/1/rank-dealers");
      const tbody = document.getElementById("dealers-tbody");
      if (!lots.ranked_dealers || lots.ranked_dealers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No registered dealers found.</td></tr>`;
        return;
      }
      tbody.innerHTML = lots.ranked_dealers.map(d => `
        <tr>
          <td><strong>#${d.dealer_id}</strong></td>
          <td><strong>${d.dealership_name}</strong></td>
          <td>01AABCT8899Z1Z5</td>
          <td>${d.city}, J&amp;K</td>
          <td>₹${d.monthly_budget.toLocaleString("en-IN")}</td>
          <td><span class="badge badge-gold">Pashmina &amp; Walnut</span></td>
          <td>★ ${d.reliability_rating}/5</td>
          <td><span class="badge badge-success">APPROVED</span></td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async loadWholesaleListings() {
    try {
      const listings = await this.fetchApi("/admin/wholesale/listings");
      const tbody = document.getElementById("wholesale-tbody");
      if (!listings || listings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No wholesale listings on record.</td></tr>`;
        return;
      }
      tbody.innerHTML = listings.map(l => `
        <tr>
          <td><strong>#${l.listing_id}</strong></td>
          <td><strong>${l.listing_title}</strong></td>
          <td>${l.dealer_name}</td>
          <td><span class="badge badge-gold">MOQ ${l.minimum_order_quantity}+</span></td>
          <td>${l.available_bulk_quantity} units</td>
          <td>${l.lead_time_days} days</td>
          <td>
            ${l.price_tiers.map(t => `<span class="badge badge-neutral">${t.min_qty}+: ₹${t.unit_price.toLocaleString("en-IN")}</span>`).join(" ")}
          </td>
          <td><span class="badge badge-success">ACTIVE</span></td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async loadPlatformSettings() {
    try {
      const settings = await this.fetchApi("/admin/settings");
      const list = document.getElementById("platform-controls-list");
      if (!settings || settings.length === 0) return;
      list.innerHTML = settings.map(s => `
        <div class="control-item">
          <div class="control-info">
            <h4>${s.setting_key.replace(/_/g, " ")}</h4>
            <p>${s.description}</p>
          </div>
          <div>
            <button class="btn ${s.is_active ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="AdminApp.togglePlatformSetting('${s.setting_key}', ${!s.is_active})">
              ${s.is_active ? 'ENABLED (Click to Disable)' : 'DISABLED (Click to Enable)'}
            </button>
          </div>
        </div>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async togglePlatformSetting(key, nextState) {
    const reason = prompt(`Enter reason for changing platform control '${key}':`, "Operational update via Admin Control Center.");
    if (!reason) return;
    await this.fetchApi("/admin/settings/toggle", {
      method: "PUT",
      body: JSON.stringify({
        setting_key: key,
        is_active: nextState,
        setting_value: nextState ? "true" : "false",
        reason
      })
    });
    alert(`Platform switch '${key}' updated to ${nextState ? 'ACTIVE' : 'INACTIVE'}. Action logged to audit trail.`);
    this.loadPlatformSettings();
    this.loadAuditLogs();
  },

  async loadAuditLogs() {
    try {
      const logs = await this.fetchApi("/admin/audit-logs");
      const tbody = document.getElementById("audit-logs-tbody");
      if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">No administrative audit records yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td><small>${new Date(l.created_at).toLocaleString()}</small></td>
          <td><strong>${l.admin_email}</strong></td>
          <td><span class="badge badge-gold">${l.admin_role}</span></td>
          <td><code>${l.action}</code></td>
          <td>${l.target_resource_type} #${l.target_resource_id}</td>
          <td>${l.action_reason || "—"}</td>
          <td><small>${l.ip_address || "127.0.0.1"}</small></td>
        </tr>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  },

  async loadAdminRoles() {
    try {
      const roles = await this.fetchApi("/admin/roles/definitions");
      const grid = document.getElementById("roles-definitions-grid");
      if (!roles || roles.length === 0) return;
      grid.innerHTML = roles.map(r => `
        <div class="role-card">
          <h4>🛡️ ${r.role_name.replace(/_/g, " ")}</h4>
          <p>${r.description}</p>
        </div>
      `).join("");
    } catch (e) {
      console.error(e);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  AdminApp.init();
});
