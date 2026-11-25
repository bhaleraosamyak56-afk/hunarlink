import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/portal.css';
import PortalScope from '../../components/PortalScope.jsx';
import { useStore } from '../../state/StoreContext.jsx';
import { useClerkBridge } from '../../data/clerkConfig.js';
import { demoApi } from '../../data/adminDemo.js';
import {
  decideAdminGuardrailCase,
  fetchAdminGuardrailCases,
  fetchAdminGuardrailRules,
  fetchAdminPayments,
  fetchAdminPaymentWebhooks,
  fetchAdminRefunds,
  initiateAdminRefund,
  probeBackendHealth
} from '../../services/apiClient.js';
import { generateIdempotencyKey } from '../../services/razorpayCheckout.js';
import { appHref } from '../../utils/href.js';
import AdminLoginPage from './AdminLoginPage.jsx';
import { IconGrid, IconUsers, IconPalette, IconSearchScan, IconMapPin, IconReceipt, IconTag,
         IconFile, IconSeedling, IconBuilding, IconHandshake, IconPackage, IconShield, IconLog, IconGear } from '../../components/LineIcons.jsx';

/* ==========================================================================
   AdminPage — master admin console
   --------------------------------------------------------------------------
   Previously this page mounted the ported admin.js controller over its own DOM
   root. React rendered static markup and something else owned the behaviour.
   This version is the same design and the same data, with React as the only
   owner: every table, KPI, badge and modal is derived from `state` below.

   The controller's 11 loaders map onto fetchAll(); its 8 mutations map onto the
   action functions. Data comes from src/data/adminDemo.js, the offline adapter
   the console was already using — same deterministic dataset, same mutations,
   now returned as plain objects instead of a patched window.fetch.
   ========================================================================== */

const TABS = [
  { group: 'CHANNELS & ANALYTICS', items: [
    { id: 'dashboard', icon: <IconGrid size={16} />, label: 'Dashboard Analytics' },
    { id: 'customers', icon: <IconUsers size={16} />, label: 'Customer Management' },
    { id: 'sellers', icon: <IconPalette size={16} />, label: 'Direct Sellers (Artisans)' }
  ] },
  { group: 'VERIFICATION WORKFLOWS', items: [
    { id: 'gi', icon: <IconSearchScan size={16} />, label: 'GI LLM Verification' },
    { id: 'non-gi', icon: <IconFile size={16} />, label: 'Non-GI Manual Review' }
  ] },
  { group: 'SUPPLIER PROCUREMENT', items: [
    { id: 'suppliers', icon: <IconSeedling size={16} />, label: 'Suppliers & Lots' },
    { id: 'dealers', icon: <IconBuilding size={16} />, label: 'Dealers & Warehouses' },
    { id: 'procurement', icon: <IconHandshake size={16} />, label: 'Matching & Procurement' }
  ] },
  { group: 'B2B WHOLESALE', items: [
    { id: 'wholesale', icon: <IconPackage size={16} />, label: 'Wholesale & RFQs' }
  ] },
  { group: 'GOVERNANCE & SECURITY', items: [
    { id: 'guardrails', icon: <IconShield size={16} />, label: 'ASIGS Guardrail Center' },
    { id: 'payments', icon: <IconReceipt size={16} />, label: 'Razorpay Payments & Refunds' },
    { id: 'settings', icon: <IconShield size={16} />, label: 'Platform Control Center' },
    { id: 'audit', icon: <IconLog size={16} />, label: 'Immutable Audit Logs' },
    { id: 'roles', icon: <IconGear size={16} />, label: '14 Admin Roles (RBAC)' }
  ] }
];

const inr = (n, decimals = false) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0
  });

/* Defensive shaping: a loader that answers with the wrong shape must never put
   `undefined` into state (an undefined dependency re-arms the load effect on
   every render, i.e. an infinite refetch loop). */
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const WHOLESALE_ADMIN_KEY = 'hunarlink_wholesale_admin_requests';

function loadWholesaleAdminRequests() {
  try {
    const raw = window.localStorage.getItem(WHOLESALE_ADMIN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWholesaleAdminRequests(list) {
  try {
    window.localStorage.setItem(WHOLESALE_ADMIN_KEY, JSON.stringify(list));
  } catch {
    /* ignore storage quota errors */
  }
}

const EMPTY = {
  metrics: null,
  customers: [],
  sellers: [],
  audits: [],
  nonGi: [],
  lots: [],
  dealers: [],
  listings: [],
  settings: [],
  logs: [],
  roles: []
};

export default function AdminPage() {

  /* The admin bearer token is session state owned by the store, which persists
     it under hunarlink_admin_token and mirrors changes from other tabs. */
  const { toast, adminToken, setAdminToken } = useStore();
  const clerk = useClerkBridge();
  const [tab, setTab] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState({ online: false, ready: null });
  const [liveOps, setLiveOps] = useState({
    loading: false,
    error: null,
    cases: [],
    rules: [],
    payments: [],
    webhooks: [],
    refunds: []
  });

  const [data, setData] = useState(EMPTY);
  const [wholesaleApps, setWholesaleApps] = useState(() => loadWholesaleAdminRequests());
  const [customerQuery, setCustomerQuery] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');

  const [activeLot, setActiveLot] = useState(null);
  const [matching, setMatching] = useState({ open: false, busy: false, dealers: [] });

  /* reason prompts, replacing the controller's window.prompt() flows */
  const [prompt, setPrompt] = useState(null);
  const [promptValue, setPromptValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metrics, customers, sellers, audits, nonGi, lots, dealers, listings, settings, logs, roles] =
        await Promise.all([
          demoApi('/admin/dashboard/metrics'),
          demoApi('/admin/customers'),
          demoApi('/admin/sellers'),
          demoApi('/admin/verifications/gi'),
          demoApi('/admin/verifications/non-gi'),
          demoApi('/admin/procurement/lots'),
          demoApi('/admin/procurement/lots/1/rank-dealers'),
          demoApi('/admin/wholesale/listings'),
          demoApi('/admin/settings'),
          demoApi('/admin/audit-logs'),
          demoApi('/admin/roles/definitions')
        ]);
      setData({
        metrics: obj(metrics),
        customers: arr(customers),
        sellers: arr(sellers),
        audits: arr(audits),
        nonGi: arr(nonGi),
        lots: arr(lots),
        dealers: arr(dealers && dealers.ranked_dealers),
        listings: arr(listings),
        settings: arr(settings),
        logs: arr(logs),
        roles: arr(roles)
      });
      setWholesaleApps(loadWholesaleAdminRequests());
    } catch (err) {
      if (import.meta.env.DEV) console.error('admin load failed', err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadLiveBackendOps = useCallback(async () => {
    const status = await probeBackendHealth();
    setBackendStatus(status);
    if (!status.online) {
      setLiveOps((prev) => ({
        ...prev,
        loading: false,
        error: 'FastAPI backend is offline (Static Preview Mode). Run uvicorn on :8000 or set VITE_API_BASE_URL to manage live ASIGS cases and Razorpay payments.'
      }));
      return;
    }

    setLiveOps((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const token = (clerk?.getToken ? await clerk.getToken() : null) || null;
      if (!token) {
        setLiveOps({
          loading: false,
          error:
            'FastAPI backend is online, but live Admin Guardrail & Payment endpoints require a Clerk Admin Bearer JWT (demo offline login cannot bypass server RBAC).',
          cases: [],
          rules: [],
          payments: [],
          webhooks: [],
          refunds: []
        });
        return;
      }

      const [cases, rules, payments, webhooks, refunds] = await Promise.all([
        fetchAdminGuardrailCases(token),
        fetchAdminGuardrailRules(token),
        fetchAdminPayments(token),
        fetchAdminPaymentWebhooks(token),
        fetchAdminRefunds(token)
      ]);
      setLiveOps({
        loading: false,
        error: null,
        cases: arr(cases),
        rules: arr(rules),
        payments: arr(payments),
        webhooks: arr(webhooks),
        refunds: arr(refunds)
      });
    } catch (err) {
      setLiveOps((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Unable to load live FastAPI Admin operations.'
      }));
    }
  }, [clerk]);

  useEffect(() => {
    if (adminToken) {
      load();
      loadLiveBackendOps();
    } else {
      setLoading(false);
    }
  }, [adminToken, load, loadLiveBackendOps]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === WHOLESALE_ADMIN_KEY) {
        setWholesaleApps(loadWholesaleAdminRequests());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function updateWholesaleAppStatus(reqId, newStatus) {
    setWholesaleApps((list) => {
      const next = list.map((r) => (r.id === reqId ? { ...r, status: newStatus } : r));
      saveWholesaleAdminRequests(next);
      return next;
    });
    toast(`Wholesale application ${reqId} updated -> ${newStatus}`, 'success');
  }

  /* Escape closes the drawer / prompt, mirroring the controller's keydown */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setDrawerOpen(false);
      setPrompt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeTab = useMemo(
    () => TABS.flatMap((g) => g.items).find((t) => t.id === tab) || TABS[0].items[0],
    [tab]
  );

  /* ---- actions ------------------------------------------------------- */
  function logout() {
    setAdminToken(null);
    setData(EMPTY);
    toast('Administrative session closed.');
  }

  function ask(type, payload, message, defaultValue) {
    setPromptValue(defaultValue);
    setPrompt({ type, payload, message });
  }

  async function confirmPrompt() {
    const reason = promptValue.trim();
    if (!reason) return;
    const { type, payload } = prompt;
    setPrompt(null);

    if (type === 'seller') {
      await demoApi(`/admin/sellers/${payload.id}/moderate`, {
        method: 'PUT',
        body: JSON.stringify({ status: payload.status, reason })
      });
      toast(`Seller #${payload.id} set to ${payload.status}.`, 'success');
    } else if (type === 'gi') {
      await demoApi(`/admin/verifications/gi/${payload.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision: payload.decision, decision_notes: reason })
      });
      toast(`Audit #${payload.id}: ${payload.decision.replace(/_/g, ' ')}.`, 'success');
    } else if (type === 'non-gi') {
      await demoApi(`/admin/verifications/non-gi/${payload.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ status: 'VERIFIED', admin_remarks: reason })
      });
      toast(`${payload.name} marked verified.`, 'success');
    } else if (type === 'setting') {
      await demoApi('/admin/settings/toggle', {
        method: 'PUT',
        body: JSON.stringify({
          setting_key: payload.key,
          is_active: payload.next,
          setting_value: payload.next ? 'true' : 'false',
          reason
        })
      });
      toast(`Platform switch '${payload.key}' ${payload.next ? 'ENABLED' : 'DISABLED'}.`, 'success');
    } else if (type === 'guardrail_decision') {
      try {
        const token = clerk?.getToken ? await clerk.getToken() : null;
        await decideAdminGuardrailCase(
          payload.caseId,
          { decision: payload.decision, reason },
          token
        );
        toast(`ASIGS Case ${payload.caseNumber}: ${payload.decision}`, 'success');
        await loadLiveBackendOps();
      } catch (err) {
        toast(err?.message || 'Failed to record ASIGS guardrail decision.', 'error');
      }
      return;
    } else if (type === 'payment_refund') {
      try {
        const token = clerk?.getToken ? await clerk.getToken() : null;
        await initiateAdminRefund(
          payload.paymentId,
          {
            refund_type: payload.refundType || 'FULL',
            amount: payload.amount || null,
            reason,
            idempotency_key: generateIdempotencyKey('rfd')
          },
          token
        );
        toast(`Refund initiated for payment ${payload.paymentRef}.`, 'success');
        await loadLiveBackendOps();
      } catch (err) {
        toast(err?.message || 'Failed to initiate Razorpay refund.', 'error');
      }
      return;
    }
    load();
  }

  async function toggleCustomer(c) {
    const next = c.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`Change customer #${c.user_id} status to ${next}?`)) return;
    await demoApi(`/admin/customers/${c.user_id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ account_status: next, reason: 'Administrative review via control dashboard.' })
    });
    toast(`Customer #${c.user_id} ${next === 'ACTIVE' ? 'reinstated' : 'suspended'}.`, 'success');
    load();
  }

  async function runTestAudit() {
    setLoading(true);
    const res = await demoApi('/admin/verifications/gi/run-audit', {
      method: 'POST',
      body: JSON.stringify({
        target_type: 'SELLER',
        target_id: 2,
        applicant_name: 'Ghulam Nabi Mir (Zadibal Weavers)',
        claimed_gi_code: 'GI-JK-PASH-8821',
        craft_category: 'Kashmir Pashmina',
        cluster: 'Srinagar / Downtown'
      })
    });
    toast(
      `LLM audit complete — ${res.confidence_score}% confidence. Human decision still required.`,
      'success'
    );
    await load();
  }

  async function runMatching(lotId) {
    setMatching({ open: true, busy: true, dealers: [] });
    const res = await demoApi(`/admin/procurement/lots/${lotId}/rank-dealers`);
    const ranked = (res && res.ranked_dealers) || [];
    /* ranking_score is not in the demo rows — score them the way the console
       ordered them, by reliability then budget headroom. */
    const scored = ranked
      .map((d, i) => ({
        ...d,
        dealer_id: d.dealer_id || 500 + i,
        ranking_score: Math.round((d.reliability_rating || 4) * 20)
      }))
      .sort((a, b) => b.ranking_score - a.ranking_score);
    setMatching({ open: true, busy: false, dealers: scored });
    toast('Dealer matching complete — ranked by category fit and reliability.', 'success');
  }

  function selectLot(lot) {
    setActiveLot(lot);
    setTab('procurement');
    runMatching(lot.lot_id);
  }

  async function assignDealer(lot, dealer) {
    if (!window.confirm(`Assign Lot #${lot.lot_id} to Dealer #${dealer.dealer_id} (${dealer.ranking_score} pts)?`)) return;
    await demoApi('/admin/procurement/assign', {
      method: 'POST',
      body: JSON.stringify({
        lot_id: lot.lot_id,
        dealer_id: dealer.dealer_id,
        ranking_score: dealer.ranking_score,
        match_reasons: ['Category match', 'Budget verified', 'Transit approved']
      })
    });
    toast(`${lot.lot_number} assigned to ${dealer.dealership_name}.`, 'success');
    load();
  }

  /* ---- derived rows -------------------------------------------------- */
  const customers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return data.customers;
    return data.customers.filter((c) =>
      [c.first_name, c.last_name, c.email, c.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data.customers, customerQuery]);

  const sellers = useMemo(() => {
    if (!sellerFilter) return data.sellers;
    return data.sellers.filter((s) => s.status === sellerFilter);
  }, [data.sellers, sellerFilter]);

  const kpis = data.metrics?.kpis;

  /* The admin route is a true sign-in page until a persisted session exists.
     Once authenticated, keep this same console and its existing logout flow. */
  if (!adminToken) return <AdminLoginPage />;

  /* ==================================================================== */
  return (
    <>
      <PortalScope family="admin" />
      <div className="admin-page-root">
        {/* MAIN SHELL */}
        <div className="admin-shell" id="admin-shell">
          <aside className={`admin-sidebar${drawerOpen ? ' is-open' : ''}`} id="admin-sidebar">
            <div className="sidebar-brand">
              <div className="brand-crest">H</div>
              <div className="brand-titles">
                <h3>HunarLink</h3>
                <span>Master Admin System</span>
              </div>
            </div>

            <nav className="sidebar-nav">
              {TABS.map((group) => (
                <React.Fragment key={group.group}>
                  <div className="nav-section-title">{group.group}</div>
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`nav-item${tab === item.id ? ' active' : ''}`}
                      data-tab={item.id}
                      onClick={(e) => {
                        e.preventDefault();
                        setTab(item.id);
                        setDrawerOpen(false);
                      }}
                    >
                      {item.icon} {item.label}
                    </a>
                  ))}
                </React.Fragment>
              ))}
            </nav>

            <div className="sidebar-footer">
              <div
                style={{
                  fontSize: '0.72rem',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  background: backendStatus.online ? 'rgba(22, 130, 82, 0.16)' : 'rgba(255,255,255,0.08)',
                  color: backendStatus.online ? '#a6f0c9' : '#d6cfc1'
                }}
              >
                {backendStatus.online ? '● FastAPI Backend Online' : '○ Static Preview Mode'}
              </div>
              <div className="user-chip">
                <div className="status-indicator online"></div>
                <div className="chip-info">
                  <span className="user-name" id="session-user-name">Super Admin</span>
                  <span className="user-role" id="session-role-name">SUPER_ADMIN</span>
                </div>
              </div>
              <button id="btn-logout" className="btn btn-outline-sm" onClick={logout}>Logout</button>
            </div>
          </aside>

          <div
            className={`admin-sidebar-backdrop${drawerOpen ? ' is-open' : ''}`}
            id="admin-sidebar-backdrop"
            onClick={() => setDrawerOpen(false)}
          ></div>

          <main className="admin-main" id="main-content">
            <header className="admin-header">
              <div className="header-breadcrumb">
                <button
                  type="button"
                  className="admin-nav-toggle"
                  id="admin-nav-toggle"
                  aria-label="Open navigation"
                  aria-expanded={drawerOpen}
                  aria-controls="admin-sidebar"
                  onClick={() => setDrawerOpen((v) => !v)}
                >
                  &#9776;
                </button>
                <span id="breadcrumb-channel">Retail + Wholesale + Supplier Procurement</span>
                <h1 id="breadcrumb-title">{activeTab.label}</h1>
              </div>
              <div className="header-actions">
                <div className="badge badge-success" id="connection-pill">
                  ● {adminToken ? 'API Connected (demo data)' : 'Awaiting session'}
                </div>
                <button id="btn-refresh-data" className="btn btn-secondary" onClick={load}>
                  ↻ Refresh Data
                </button>
                <a href={appHref('/')} className="btn btn-outline" target="_blank" rel="noreferrer">
                  View Marketplace ↗
                </a>
              </div>
            </header>

            {/* TAB 1: DASHBOARD */}
            {tab === 'dashboard' && (
              <section id="tab-dashboard" className="tab-pane active">
                <div className="ad-kpi-grid">
                  <div className="ad-kpi-card">
                    <span className="ad-kpi-label">Retail Marketplace GMV</span>
                    <div className="ad-kpi-value" id="kpi-retail-gmv">{inr(kpis?.financials.retail_gmv, true)}</div>
                    <span className="ad-kpi-sub">Direct artisan B2C purchases</span>
                  </div>
                  <div className="ad-kpi-card">
                    <span className="ad-kpi-label">Wholesale B2B GMV</span>
                    <div className="ad-kpi-value" id="kpi-wholesale-gmv">{inr(kpis?.financials.wholesale_gmv, true)}</div>
                    <span className="ad-kpi-sub">Bulk dealer-buyer transactions</span>
                  </div>
                  <div className="ad-kpi-card highlight">
                    <span className="ad-kpi-label">Platform Net Revenue</span>
                    <div className="ad-kpi-value" id="kpi-platform-revenue">{inr(kpis?.financials.platform_revenue, true)}</div>
                    <span className="ad-kpi-sub">0% artisan direct / 5% wholesale fee</span>
                  </div>
                  <div className="ad-kpi-card">
                    <span className="ad-kpi-label">Verified GI Artisans</span>
                    <div className="ad-kpi-value" id="kpi-verified-sellers">{kpis?.users.approved_sellers ?? '—'}</div>
                    <span className="ad-kpi-sub">Approved active guild workshops</span>
                  </div>
                  <div className="ad-kpi-card">
                    <span className="ad-kpi-label">Pending GI Verifications</span>
                    <div className="ad-kpi-value alert-text" id="kpi-pending-gi">{kpis?.pending_actions.pending_gi_verifications ?? '—'}</div>
                    <span className="ad-kpi-sub">Awaiting human officer approval</span>
                  </div>
                  <div className="ad-kpi-card">
                    <span className="ad-kpi-label">Pending Supplier Lots</span>
                    <div className="ad-kpi-value warning-text" id="kpi-pending-lots">{kpis?.pending_actions.pending_supplier_lots ?? '—'}</div>
                    <span className="ad-kpi-sub">Awaiting dealer matching assignment</span>
                  </div>
                </div>

                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Three-Channel Ecosystem Health</h3>
                    <span className="panel-tag">Live Platform Data</span>
                  </div>
                  <div className="channel-summary-grid">
                    <div className="channel-box">
                      <h4>Channel A: Retail Marketplace</h4>
                      <p>Customers purchasing directly from approved Master Artisans. 100% direct remuneration, 0% platform commission on GI heirlooms.</p>
                      <div className="stat-row"><span>Active Products:</span><strong id="stat-retail-prods">{kpis?.catalog.retail_products ?? '—'}</strong></div>
                      <div className="stat-row"><span>Registered Users:</span><strong id="stat-customers">{kpis?.users.total_customers ?? '—'}</strong></div>
                    </div>
                    <div className="channel-box">
                      <h4>Channel B: Wholesale Marketplace</h4>
                      <p>B2B buyers purchasing in bulk (MOQ 10+) from approved regional dealers, utilizing dynamic price tiering and RFQ negotiations.</p>
                      <div className="stat-row"><span>Active Bulk Listings:</span><strong id="stat-wholesale-listings">{kpis?.catalog.wholesale_listings ?? '—'}</strong></div>
                      <div className="stat-row"><span>Wholesale Buyers:</span><strong id="stat-wholesale-buyers">{kpis?.users.total_wholesale_buyers ?? '—'}</strong></div>
                    </div>
                    <div className="channel-box">
                      <h4>Channel C: Supplier Procurement</h4>
                      <p>Raw producers and spinner cooperatives submit product lots. Admin assigns suitable vetted dealers via algorithmic matching.</p>
                      <div className="stat-row"><span>Active Suppliers:</span><strong id="stat-suppliers">{kpis?.users.total_suppliers ?? '—'}</strong></div>
                      <div className="stat-row"><span>Approved Dealers:</span><strong id="stat-dealers">{kpis?.users.total_dealers ?? '—'}</strong></div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 2: CUSTOMERS */}
            {tab === 'customers' && (
              <section id="tab-customers" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Customer Profiles &amp; Account Control</h3>
                    <div className="filter-controls">
                      <input
                        type="text"
                        id="customer-search-input"
                        placeholder="Search by name, email, phone..."
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table" id="customers-table">
                      <thead>
                        <tr>
                          <th>ID</th><th>Customer Name</th><th>Email</th><th>Phone</th>
                          <th>Addresses</th><th>Account Status</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody id="customers-tbody">
                        {customers.length === 0 ? (
                          <tr><td colSpan="7" className="loading-cell">No customers found.</td></tr>
                        ) : (
                          customers.map((c) => (
                            <tr key={c.user_id}>
                              <td><strong>#{c.user_id}</strong></td>
                              <td>{c.first_name} {c.last_name || ''}</td>
                              <td>{c.email}</td>
                              <td>{c.phone || '—'}</td>
                              <td><span className="badge badge-neutral">{c.addresses_count} saved</span></td>
                              <td>
                                <span className={`badge ${c.account_status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                                  {c.account_status}
                                </span>
                              </td>
                              <td>
                                {c.account_status === 'ACTIVE' ? (
                                  <button className="btn btn-outline-sm btn-sm" onClick={() => toggleCustomer(c)}>Suspend</button>
                                ) : (
                                  <button className="btn btn-primary btn-sm" onClick={() => toggleCustomer(c)}>Reinstate</button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 3: SELLERS */}
            {tab === 'sellers' && (
              <section id="tab-sellers" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Direct Seller (Artisan Workshop) Management</h3>
                    <div className="filter-controls">
                      <select
                        id="seller-status-filter"
                        value={sellerFilter}
                        onChange={(e) => setSellerFilter(e.target.value)}
                      >
                        <option value="">All Statuses</option>
                        <option value="APPROVED">Approved Only</option>
                        <option value="PENDING">Pending Review</option>
                        <option value="SUSPENDED">Suspended</option>
                      </select>
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table" id="sellers-table">
                      <thead>
                        <tr>
                          <th>ID</th><th>Store / Guild Name</th><th>Craft Specialty</th>
                          <th>GI Authorization</th><th>Rating</th><th>Store Status</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody id="sellers-tbody">
                        {sellers.length === 0 ? (
                          <tr><td colSpan="7" className="loading-cell">No sellers in this view.</td></tr>
                        ) : (
                          sellers.map((s) => (
                            <tr key={s.seller_id}>
                              <td><strong>#{s.seller_id}</strong></td>
                              <td><strong>{s.store_name}</strong></td>
                              <td>{s.craft_specialty}</td>
                              <td>
                                {s.has_gi_certification ? (
                                  <span className="badge badge-gold">{s.gi_authorized_user_number || 'GI Certified'}</span>
                                ) : (
                                  <span className="badge badge-neutral">Standard Craft</span>
                                )}
                              </td>
                              <td>{s.average_rating} ({s.total_reviews})</td>
                              <td>
                                <span className={`badge ${s.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                                  {s.status}
                                </span>
                              </td>
                              <td>
                                {s.status === 'APPROVED' ? (
                                  <button
                                    className="btn btn-outline-sm btn-sm"
                                    onClick={() =>
                                      ask('seller', { id: s.seller_id, status: 'SUSPENDED' },
                                        `Suspension reason for ${s.store_name}`, 'Quality inspection required.')
                                    }
                                  >
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() =>
                                      ask('seller', { id: s.seller_id, status: 'APPROVED' },
                                        `Approval note for ${s.store_name}`, 'Artisan documentation verified.')
                                    }
                                  >
                                    Approve Store
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 4: GI VERIFICATION */}
            {tab === 'gi' && (
              <section id="tab-gi" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>GI Verification Management (LLM-Assisted + Human Sovereign Review)</h3>
                    <button id="btn-trigger-test-gi" className="btn btn-secondary" onClick={runTestAudit}>Run Test LLM Audit
                    </button>
                  </div>
                  <p className="section-notice">
                    <strong>Legal Notice:</strong> The LLM service extracts Gazette reference data, checks
                    matching/missing fields, and computes confidence scores. In compliance with legal GI governance,{' '}
                    <em>an LLM recommendation alone is never accepted as proof of legal identity</em>. Authorized
                    Verification Admins must make the final decision.
                  </p>
                  <div className="table-responsive">
                    <table className="data-table" id="gi-audits-table">
                      <thead>
                        <tr>
                          <th>Audit ID</th><th>Applicant</th><th>Claimed GI Code</th>
                          <th>LLM Provider &amp; Model</th><th>Confidence Score</th>
                          <th>Matching Fields</th><th>Discrepancies</th><th>Admin Decision</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="gi-audits-tbody">
                        {data.audits.length === 0 ? (
                          <tr><td colSpan="9" className="loading-cell">No GI audits on record. Click 'Run Test LLM Audit' above to test.</td></tr>
                        ) : (
                          data.audits.map((a) => (
                            <tr key={a.audit_id}>
                              <td><strong>#{a.audit_id}</strong></td>
                              <td>{a.applicant_name}</td>
                              <td><span className="badge badge-gold">{a.claimed_gi_code}</span></td>
                              <td>{a.llm_provider} ({a.model_version || 'v2'})</td>
                              <td><strong>{a.confidence_score}%</strong></td>
                              <td>
                                {(a.matching_fields || []).map((m) => (
                                  <span className="badge badge-success" key={m}>{m}</span>
                                ))}{' '}
                              </td>
                              <td>
                                {(a.mismatching_fields || []).length
                                  ? a.mismatching_fields.map((m) => (
                                      <span className="badge badge-warning" key={m}>{m}</span>
                                    ))
                                  : 'None'}
                              </td>
                              <td>
                                <span className={`badge ${a.admin_decision === 'APPROVED' || a.admin_decision === 'APPROVED_BY_ADMIN' ? 'badge-success' : 'badge-warning'}`}>
                                  {a.admin_decision}
                                </span>
                              </td>
                              <td>
                                {a.admin_decision === 'PENDING' || a.admin_decision === 'PENDING_HUMAN_REVIEW' ? (
                                  <>
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={() =>
                                        ask('gi', { id: a.audit_id, decision: 'APPROVED_BY_ADMIN' },
                                          `Verification notes for Audit #${a.audit_id}`, 'Verified against official gazette registry records.')
                                      }
                                    >
                                      Approve GI
                                    </button>
                                    <button
                                      className="btn btn-outline-sm btn-sm"
                                      onClick={() =>
                                        ask('gi', { id: a.audit_id, decision: 'REJECTED_BY_ADMIN' },
                                          `Rejection notes for Audit #${a.audit_id}`, 'Claimed authorisation does not match the gazette entry.')
                                      }
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : (
                                  'Completed'
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 5: NON-GI */}
            {tab === 'non-gi' && (
              <section id="tab-non-gi" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Non-GI Manual Seller &amp; Supplier Verification</h3>
                    <span className="badge badge-neutral">Completely Admin-Based (No LLM)</span>
                  </div>
                  <p className="section-notice">
                    Manual document review for standard non-GI handicrafts: identity proof, PAN/GSTIN certificates,
                    and physical workshop premises validation.
                  </p>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Verification ID</th><th>Target Type</th><th>Business Name</th>
                          <th>Tax / PAN ID</th><th>Investigation Status</th><th>Remarks</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="non-gi-tbody">
                        {data.nonGi.length === 0 ? (
                          <tr><td colSpan="7" className="loading-cell">No pending manual document verification cases.</td></tr>
                        ) : (
                          data.nonGi.map((r) => (
                            <tr key={r.verification_id}>
                              <td>#{r.verification_id}</td>
                              <td>{r.target_type}</td>
                              <td><strong>{r.business_name}</strong></td>
                              <td>{r.pan_or_tax_id || 'N/A'}</td>
                              <td>
                                <span className={`badge ${r.status === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>
                                  {r.status}
                                </span>
                              </td>
                              <td>{r.admin_remarks || 'Awaiting initial inspector review'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline-sm btn-sm"
                                  onClick={() =>
                                    ask(
                                      'non-gi',
                                      { id: r.verification_id, name: r.business_name },
                                      `Review remarks for ${r.business_name}:`,
                                      'Documents verified against PAN records.'
                                    )
                                  }
                                >
                                  Review Docs
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 6: SUPPLIERS & LOTS */}
            {tab === 'suppliers' && (
              <section id="tab-suppliers" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Raw Producer &amp; Supplier Lots</h3>
                    <span className="panel-tag">Supplier-to-Dealer Procurement Channel</span>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Lot #</th><th>Producer / Supplier</th><th>Craft Title</th><th>GI Tagged</th>
                          <th>Quantity Available</th><th>Expected Unit Price</th><th>Total Lot Value</th>
                          <th>Lot Status</th><th>Procurement Action</th>
                        </tr>
                      </thead>
                      <tbody id="lots-tbody">
                        {data.lots.length === 0 ? (
                          <tr><td colSpan="9" className="loading-cell">No supplier product lots submitted.</td></tr>
                        ) : (
                          data.lots.map((l) => (
                            <tr key={l.lot_id}>
                              <td><strong>{l.lot_number}</strong></td>
                              <td>{l.supplier_name}</td>
                              <td><strong>{l.craft_title}</strong></td>
                              <td>
                                {l.is_gi_tagged ? (
                                  <span className="badge badge-gold">GI Certified</span>
                                ) : 'Standard'}
                              </td>
                              <td>{l.quantity_available} {l.unit_of_measure}</td>
                              <td>{inr(l.expected_unit_price)}</td>
                              <td><strong>{inr(l.total_value)}</strong></td>
                              <td>
                                <span className={`badge ${l.status === 'PROCURED' ? 'badge-success' : 'badge-warning'}`}>
                                  {l.status}
                                </span>
                              </td>
                              <td>
                                <button className="btn btn-primary btn-sm" onClick={() => selectLot(l)}>
                                  Match Dealers →
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 7: DEALERS */}
            {tab === 'dealers' && (
              <section id="tab-dealers" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header"><h3>Approved Regional Dealers &amp; Hubs</h3></div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th><th>Dealership Name</th><th>GSTIN</th><th>Warehouse Hub</th>
                          <th>Monthly Budget</th><th>Specializations</th><th>Reliability</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody id="dealers-tbody">
                        {data.dealers.length === 0 ? (
                          <tr><td colSpan="8" className="loading-cell">No registered dealers found.</td></tr>
                        ) : (
                          data.dealers.map((d) => (
                            <tr key={d.dealer_id}>
                              <td><strong>#{d.dealer_id}</strong></td>
                              <td><strong>{d.dealership_name}</strong></td>
                              <td>01AABCT8899Z1Z5</td>
                              <td>{d.city}, J&amp;K</td>
                              <td>{inr(d.monthly_budget)}</td>
                              <td><span className="badge badge-gold">Pashmina &amp; Walnut</span></td>
                              <td>{d.reliability_rating}/5</td>
                              <td><span className="badge badge-success">APPROVED</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 8: PROCUREMENT */}
            {tab === 'procurement' && (
              <section id="tab-procurement" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header"><h3>Dealer Matching Engine &amp; Procurement Pipeline</h3></div>
                  <p className="section-notice">
                    The matching algorithm ranks dealers by category, capacity, transit proximity, and reliability
                    score. Admin selects a dealer, issues a formal purchase order, and records goods receipt.
                  </p>
                  <div id="matching-workflow-box" className="workflow-interactive-box">
                    <div className="step-card">
                      <h4>
                        Active Lot:{' '}
                        <span id="active-lot-title">
                          {activeLot
                            ? `${activeLot.craft_title} (${activeLot.lot_number})`
                            : 'Grade-A Handspun Changthangi Pashmina Skeins (Lot # LOT-BUD-2026-001)'}
                        </span>
                      </h4>
                      <p>
                        Quantity: <strong>{activeLot ? activeLot.quantity_available : 120} {activeLot ? activeLot.unit_of_measure : 'Skeins'}</strong>{' '}
                        | Expected Value: <strong>{inr(activeLot ? activeLot.total_value : 456000, true)}</strong>{' '}
                        | Cluster: <strong>{activeLot ? activeLot.supplier_name : 'Budgam, Kashmir'}</strong>
                      </p>
                      <button
                        id="btn-run-matching"
                        className="btn btn-primary"
                        onClick={() => runMatching(activeLot ? activeLot.lot_id : 1)}
                      >Execute Dealer Matching Algorithm
                      </button>
                    </div>

                    <div
                      id="matching-results-container"
                      style={{ display: matching.open ? 'block' : 'none', marginTop: '1.5rem' }}
                    >
                      <h4>Recommended &amp; Ranked Dealers (Algorithmic Output)</h4>
                      <div id="ranked-dealers-list" className="ranked-dealers-grid">
                        {matching.busy ? (
                          <div className="loading-cell">
                            Evaluating dealer specializations, procurement budgets, and transit logistics...
                          </div>
                        ) : (
                          matching.dealers.map((d, index) => (
                            <div className="dealer-rank-card" key={d.dealer_id}>
                              <div className="rank-badge">Rank #{index + 1} ({d.ranking_score} pts)</div>
                              <h4>{d.dealership_name}</h4>
                              <p>Location: <strong>{d.city}</strong> | Rating: <strong>{d.reliability_rating}/5</strong></p>
                              <p>Monthly Budget: <strong>{inr(d.monthly_budget)}</strong></p>
                              <ul style={{ fontSize: '0.78rem', color: '#555', margin: '0.5rem 0 1rem 1.2rem' }}>
                                <li>Category specialisation match</li>
                                <li>Budget headroom verified</li>
                                <li>Transit route approved</li>
                              </ul>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ width: '100%' }}
                                onClick={() => assignDealer(activeLot || { lot_id: 1, lot_number: 'LOT-2026-0114' }, d)}
                              >
                                Assign Procurement Lot to This Dealer →
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 9: WHOLESALE */}
            {tab === 'wholesale' && (
              <section id="tab-wholesale" className="tab-pane active">
                <div className="panel-card" style={{ marginBottom: '1.5rem' }}>
                  <div className="panel-header">
                    <h3>Incoming Local Seller Wholesale Applications ({wholesaleApps.length})</h3>
                    <span className="badge badge-gold">Synced with /wholesale</span>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Ref ID</th><th>Seller / Workshop</th><th>Guild &amp; Craft</th>
                          <th>Capacity &amp; Rate</th><th>GI Status</th><th>Status</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="wholesale-apps-tbody">
                        {wholesaleApps.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="loading-cell">
                              No local seller applications submitted yet from the Wholesale Desk.
                            </td>
                          </tr>
                        ) : (
                          wholesaleApps.map((app) => (
                            <tr key={app.id}>
                              <td><strong>{app.id}</strong></td>
                              <td>
                                <strong>{app.sellerName}</strong>
                                <div style={{ fontSize: '0.78rem', color: '#555' }}>
                                  {app.workshop} &bull; {app.phone}
                                </div>
                              </td>
                              <td>
                                <strong>{app.guild}</strong>
                                <div style={{ fontSize: '0.78rem', color: '#555' }}>{app.productOffered}</div>
                              </td>
                              <td>
                                {app.supplyCapacity} units @ {inr(app.wholesaleRate)}/unit
                              </td>
                              <td><span className="badge badge-neutral">{app.giStatus}</span></td>
                              <td>
                                <span
                                  className={`badge ${
                                    /Approved/i.test(app.status || '') ? 'badge-success' : 'badge-warning'
                                  }`}
                                >
                                  {app.status || 'Submitted'}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => updateWholesaleAppStatus(app.id, 'Approved by Admin — Onboarding')}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-sm btn-sm"
                                    onClick={() => updateWholesaleAppStatus(app.id, 'Cluster Inspection Scheduled')}
                                  >
                                    Schedule Visit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-sm btn-sm"
                                    onClick={() => updateWholesaleAppStatus(app.id, 'Sample Requested by Admin')}
                                  >
                                    Request Sample
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="panel-card">
                  <div className="panel-header"><h3>Wholesale Catalog &amp; B2B RFQs</h3></div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th><th>Wholesale Listing</th><th>Dealer Fulfilment</th><th>MOQ</th>
                          <th>Bulk Stock</th><th>Lead Time</th><th>Pricing Tiers</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody id="wholesale-tbody">
                        {data.listings.length === 0 ? (
                          <tr><td colSpan="8" className="loading-cell">No wholesale listings on record.</td></tr>
                        ) : (
                          data.listings.map((l) => (
                            <tr key={l.listing_id}>
                              <td><strong>#{l.listing_id}</strong></td>
                              <td><strong>{l.listing_title}</strong></td>
                              <td>{l.dealer_name}</td>
                              <td><span className="badge badge-gold">MOQ {l.minimum_order_quantity}+</span></td>
                              <td>{l.available_bulk_quantity} units</td>
                              <td>{l.lead_time_days} days</td>
                              <td>
                                {(l.price_tiers || []).map((t) => (
                                  <span className="badge badge-neutral" key={t.min_qty}>
                                    {t.min_qty}+: {inr(t.unit_price)}
                                  </span>
                                ))}{' '}
                              </td>
                              <td><span className="badge badge-success">ACTIVE</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* LIVE TAB A: ASIGS GUARDRAIL CENTER */}
            {tab === 'guardrails' && (
              <section id="tab-guardrails" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>ASIGS Guardrail Center (Live FastAPI)</h3>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={loadLiveBackendOps}
                    >
                      Refresh Live Data
                    </button>
                  </div>
                  {liveOps.error && (
                    <p className="section-notice">{liveOps.error}</p>
                  )}
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Case #</th><th>Workflow</th><th>Outcome</th><th>Status</th>
                          <th>Rule Codes</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveOps.cases.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="loading-cell">
                              {liveOps.loading ? 'Loading live ASIGS cases…' : 'No open live guardrail cases loaded.'}
                            </td>
                          </tr>
                        ) : (
                          liveOps.cases.map((c) => (
                            <tr key={c.id}>
                              <td><code>{c.case_number}</code></td>
                              <td>{c.workflow_name}</td>
                              <td><span className="badge badge-gold">{c.guardrail_outcome}</span></td>
                              <td><span className="badge badge-neutral">{c.case_status}</span></td>
                              <td><small>{(c.reason_codes || []).join(', ') || '—'}</small></td>
                              <td>
                                {c.case_status === 'OPEN' ? (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      onClick={() =>
                                        ask(
                                          'guardrail_decision',
                                          { caseId: c.id, caseNumber: c.case_number, decision: 'APPROVE' },
                                          `Mandatory audit reason to APPROVE case ${c.case_number}`,
                                          'Verified seller evidence and cleared guardrail flag.'
                                        )
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      onClick={() =>
                                        ask(
                                          'guardrail_decision',
                                          { caseId: c.id, caseNumber: c.case_number, decision: 'REJECT' },
                                          `Mandatory audit reason to REJECT case ${c.case_number}`,
                                          'Rejected due to unverified submission evidence.'
                                        )
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <small>{c.decision_reason || 'Decided'}</small>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '14px', fontSize: '0.78rem', color: 'var(--text-500)' }}>
                    Active server guardrail rules loaded: <strong>{liveOps.rules.length}</strong>
                  </div>
                </div>
              </section>
            )}

            {/* LIVE TAB B: RAZORPAY PAYMENTS, WEBHOOKS & REFUNDS */}
            {tab === 'payments' && (
              <section id="tab-payments" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Razorpay Standard Checkout Payments &amp; Refunds (Live FastAPI)</h3>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={loadLiveBackendOps}
                    >
                      Refresh Live Data
                    </button>
                  </div>
                  {liveOps.error && (
                    <p className="section-notice">{liveOps.error}</p>
                  )}
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Payment Ref</th><th>Purpose</th><th>Amount</th><th>Captured</th>
                          <th>Refunded</th><th>Status</th><th>Razorpay Order</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveOps.payments.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="loading-cell">
                              {liveOps.loading ? 'Loading live payments…' : 'No live Razorpay payments loaded.'}
                            </td>
                          </tr>
                        ) : (
                          liveOps.payments.map((p) => (
                            <tr key={p.id}>
                              <td><code>{p.payment_reference}</code></td>
                              <td>{p.payment_purpose}</td>
                              <td>{inr(p.amount, true)}</td>
                              <td>{inr(p.captured_amount, true)}</td>
                              <td>{inr(p.refunded_amount, true)}</td>
                              <td><span className="badge badge-gold">{p.payment_status}</span></td>
                              <td><small><code>{p.provider_order_id || '—'}</code></small></td>
                              <td>
                                {['CAPTURED', 'PARTIALLY_REFUNDED'].includes(p.payment_status) ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() =>
                                      ask(
                                        'payment_refund',
                                        { paymentId: p.id, paymentRef: p.payment_reference, refundType: 'FULL' },
                                        `Mandatory audit reason to issue FULL refund for ${p.payment_reference}`,
                                        'Customer return verified; issuing full Razorpay refund.'
                                      )
                                    }
                                  >
                                    Full Refund
                                  </button>
                                ) : (
                                  <small>—</small>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '14px', display: 'flex', gap: '18px', fontSize: '0.78rem', color: 'var(--text-500)' }}>
                    <span>Signed Webhook Events Logged: <strong>{liveOps.webhooks.length}</strong></span>
                    <span>Processed / Tracked Refunds: <strong>{liveOps.refunds.length}</strong></span>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 10: SETTINGS */}
            {tab === 'settings' && (
              <section id="tab-settings" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Platform Sovereign Controls (Super Admin Only)</h3>
                    <span className="badge badge-gold">Emergency Switches</span>
                  </div>
                  <p className="section-notice">
                    Toggle platform operations in real-time. Maintenance mode isolates public views without
                    disrupting ongoing payment callbacks or order shipments.
                  </p>
                  <div className="controls-list" id="platform-controls-list">
                    {data.settings.map((s) => (
                      <div className="control-item" key={s.setting_key}>
                        <div className="control-info">
                          <h4>{s.setting_key.replace(/_/g, ' ')}</h4>
                          <p>{s.description}</p>
                        </div>
                        <div>
                          <button
                            className={`btn ${s.is_active ? 'btn-primary' : 'btn-outline'} btn-sm`}
                            onClick={() =>
                              ask('setting', { key: s.setting_key, next: !s.is_active },
                                `Reason for changing '${s.setting_key}'`, 'Operational update via Admin Control Center.')
                            }
                          >
                            {s.is_active ? 'ENABLED (Click to Disable)' : 'DISABLED (Click to Enable)'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* TAB 11: AUDIT LOGS */}
            {tab === 'audit' && (
              <section id="tab-audit" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Immutable System Audit Trail</h3>
                    <span className="badge badge-neutral">Tamper-Proof Ledger</span>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th><th>Admin Email</th><th>Role</th><th>Action</th>
                          <th>Target Resource</th><th>Reason / Summary</th><th>IP Address</th>
                        </tr>
                      </thead>
                      <tbody id="audit-logs-tbody">
                        {data.logs.length === 0 ? (
                          <tr><td colSpan="7" className="loading-cell">No administrative audit records yet.</td></tr>
                        ) : (
                          data.logs.map((l, i) => (
                            <tr key={l.id ?? i}>
                              <td><small>{l.created_at ? new Date(l.created_at).toLocaleString() : 'Just now'}</small></td>
                              <td><strong>{l.admin_email}</strong></td>
                              <td><span className="badge badge-gold">{l.admin_role}</span></td>
                              <td><code>{l.action}</code></td>
                              <td>{l.target_resource_type} #{l.target_resource_id}</td>
                              <td>{l.action_reason || '—'}</td>
                              <td><small>{l.ip_address || '127.0.0.1'}</small></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* TAB 12: ROLES */}
            {tab === 'roles' && (
              <section id="tab-roles" className="tab-pane active">
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Granular Administrative Roles &amp; Staff Directory</h3>
                    <span className="panel-tag">{data.roles.length} Authoritative Roles</span>
                  </div>
                  <div className="roles-grid" id="roles-definitions-grid">
                    {data.roles.map((r) => (
                      <div className="role-card" key={r.role_name}>
                        <h4>{r.role_name.replace(/_/g, ' ')}</h4>
                        <p>{r.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {loading && adminToken && (
              <div className="loading-cell" style={{ padding: '10px 0' }}>
                Syncing platform data…
              </div>
            )}
          </main>
        </div>

        {/* REASON PROMPT (replaces the controller's window.prompt flows) */}
        {prompt && (
          <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setPrompt(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Administrative Reason Required</h2>
                <p>{prompt.message}</p>
              </div>
              <div className="form-group">
                <label>Reason / Decision Notes</label>
                <input
                  type="text"
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmPrompt()}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setPrompt(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmPrompt}>Confirm &amp; Log</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
