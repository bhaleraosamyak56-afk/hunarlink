import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/portal.css';
import PortalScope from '../../components/PortalScope.jsx';
import { useStore } from '../../state/StoreContext.jsx';
import { useClerkBridge } from '../../data/clerkConfig.js';
import {
  canAttemptBackend,
  decideAdminGuardrailCase,
  fetchAdminGuardrailCases,
  fetchAdminGuardrailRules,
  fetchAdminOverview,
  fetchAdminPayments,
  fetchAdminPaymentWebhooks,
  fetchAdminRefunds,
  fetchMyAuthProfile,
  initiateAdminRefund
} from '../../services/apiClient.js';
import { generateIdempotencyKey } from '../../services/razorpayCheckout.js';
import AdminLoginPage from './AdminLoginPage.jsx';
import {
  IconGrid,
  IconUsers,
  IconPalette,
  IconPackage,
  IconReceipt,
  IconShield,
  IconLogout
} from '../../components/LineIcons.jsx';

/* ==========================================================================
   AdminPage — 100% Real DB & RBAC-Verified Administrator Console
   --------------------------------------------------------------------------
   Zero offline demo bypass (`adminDemo.js` removed). Access is granted ONLY
   when FastAPI verifies the caller's Clerk RS256 JWT AND confirms an active
   `admin_profiles` + RBAC permission grant in MySQL / SQLite.
   ========================================================================== */

const TABS = [
  { id: 'overview', label: 'Overview & Users', icon: <IconGrid size={15} /> },
  { id: 'sellers', label: 'Artisans & Listings', icon: <IconPalette size={15} /> },
  { id: 'orders', label: 'Retail Orders', icon: <IconPackage size={15} /> },
  { id: 'payments', label: 'Payments & Refunds', icon: <IconReceipt size={15} /> },
  { id: 'guardrails', label: 'ASIGS Guardrails', icon: <IconShield size={15} /> }
];

const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function AdminPage() {
  const navigate = useNavigate();
  const { toast } = useStore();
  const clerk = useClerkBridge();

  const [authState, setAuthState] = useState({
    status: 'checking', // 'unauthenticated' | 'checking' | 'denied' | 'authorized'
    email: null,
    reason: null,
    profile: null
  });
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    overview: null,
    payments: [],
    refunds: [],
    webhooks: [],
    cases: [],
    rules: []
  });

  const loadLiveAdminData = useCallback(async () => {
    if (!clerk.enabled || !clerk.isLoaded) return;
    if (!clerk.isSignedIn || !clerk.clerkUser) {
      setAuthState({ status: 'unauthenticated', email: null, reason: null, profile: null });
      return;
    }

    const email = clerk.clerkUser.primaryEmailAddress?.emailAddress || 'unknown';
    setAuthState((s) => ({ ...s, status: 'checking', email }));

    try {
      if (!canAttemptBackend()) {
        setAuthState({
          status: 'denied',
          email,
          reason: 'Live FastAPI backend is required to verify Admin RBAC permissions.',
          profile: null
        });
        return;
      }

      const token = await clerk.getToken();
      if (!token) {
        setAuthState({ status: 'unauthenticated', email: null, reason: null, profile: null });
        return;
      }

      const me = await fetchMyAuthProfile(token);
      if (!me?.is_admin) {
        setAuthState({
          status: 'denied',
          email: me?.email || email,
          reason: 'Backend RBAC check returned is_admin = false (HTTP 403 on all /api/v1/admin/* endpoints).',
          profile: null
        });
        return;
      }

      setAuthState({ status: 'authorized', email: me.email, reason: null, profile: me });
      setLoading(true);
      const [overview, payments, refunds, webhooks, cases, rules] = await Promise.all([
        fetchAdminOverview(token).catch(() => null),
        fetchAdminPayments(token).catch(() => []),
        fetchAdminRefunds(token).catch(() => []),
        fetchAdminPaymentWebhooks(token).catch(() => []),
        fetchAdminGuardrailCases(token).catch(() => []),
        fetchAdminGuardrailRules(token).catch(() => [])
      ]);
      setData({
        overview,
        payments: Array.isArray(payments) ? payments : [],
        refunds: Array.isArray(refunds) ? refunds : [],
        webhooks: Array.isArray(webhooks) ? webhooks : [],
        cases: Array.isArray(cases) ? cases : [],
        rules: Array.isArray(rules) ? rules : []
      });
    } catch (err) {
      setAuthState({
        status: 'denied',
        email,
        reason: err?.message || 'Admin authorization check failed.',
        profile: null
      });
    } finally {
      setLoading(false);
    }
  }, [clerk]);

  useEffect(() => {
    loadLiveAdminData();
  }, [loadLiveAdminData]);

  async function handleRefund(payment) {
    const reason = window.prompt(`Refund reason for payment ${payment.id}:`);
    if (!reason || !reason.trim()) return;
    try {
      const token = await clerk.getToken();
      await initiateAdminRefund(
        payment.id,
        { reason_text: reason.trim(), idempotency_key: generateIdempotencyKey('refund') },
        token
      );
      toast('Refund submitted to Razorpay & recorded in database.', 'success');
      loadLiveAdminData();
    } catch (err) {
      toast(err?.message || 'Refund failed.', 'error');
    }
  }

  async function handleCaseDecision(caseId, decision) {
    const notes = window.prompt(`Review notes for ${decision}:`) || `${decision} by admin`;
    try {
      const token = await clerk.getToken();
      await decideAdminGuardrailCase(caseId, { decision, notes }, token);
      toast(`Guardrail case marked ${decision}.`, 'success');
      loadLiveAdminData();
    } catch (err) {
      toast(err?.message || 'Could not record decision.', 'error');
    }
  }

  if (authState.status === 'checking' || !clerk.isLoaded) {
    return <AdminLoginPage checking />;
  }
  if (authState.status === 'unauthenticated') {
    return <AdminLoginPage />;
  }
  if (authState.status === 'denied') {
    return <AdminLoginPage deniedEmail={authState.email} deniedReason={authState.reason} />;
  }

  const ov = data.overview || { counts: {}, users: [], sellers: [], listings: [], orders: [] };

  return (
    <>
      <PortalScope family="admin" />
      <header className="up-header">
        <div className="up-header-inner">
          <Link to="/" className="up-brand">
            <img
              src={`${import.meta.env.BASE_URL}img/brand/logo.svg`}
              alt=""
              className="up-emblem-mark"
              height="38"
            />
            <div>
              <div className="up-brand-title">HunarLink Admin</div>
              <div className="up-brand-sub">Live Database &amp; RBAC Console</div>
            </div>
          </Link>
          <nav className="up-nav-links">
            <span style={{ fontSize: '0.82rem', opacity: 0.78 }}>{authState.email}</span>
            <Link to="/" className="up-nav-pill">Storefront</Link>
            <button
              type="button"
              className="up-nav-pill up-nav-signout"
              onClick={async () => {
                if (clerk.signOutClerk) await clerk.signOutClerk();
                navigate('/', { replace: true });
              }}
            >
              <IconLogout size={14} /> Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="up-container" id="main-content" style={{ paddingBlock: '1.75rem 3.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'btn-orange' : 'btn-orange-outline'}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
          <button
            type="button"
            className="btn-orange-outline"
            style={{ marginLeft: 'auto' }}
            onClick={loadLiveAdminData}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh Live DB'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}
        >
          <div className="fk-panel-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>USERS IN DB</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{ov.counts?.users ?? 0}</div>
          </div>
          <div className="fk-panel-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>VERIFIED ARTISANS</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{ov.counts?.sellers ?? 0}</div>
          </div>
          <div className="fk-panel-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>ACTIVE LISTINGS</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{ov.counts?.listings ?? 0}</div>
          </div>
          <div className="fk-panel-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>RETAIL ORDERS</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{ov.counts?.orders ?? 0}</div>
          </div>
        </div>

        {tab === 'overview' && (
          <section className="fk-panel-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <IconUsers size={18} /> Registered Users (Live DB)
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ padding: '0.55rem' }}>Name</th>
                    <th style={{ padding: '0.55rem' }}>Email</th>
                    <th style={{ padding: '0.55rem' }}>Clerk ID</th>
                    <th style={{ padding: '0.55rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(ov.users || []).map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '0.55rem', fontWeight: 600 }}>{u.name}</td>
                      <td style={{ padding: '0.55rem' }}>{u.email}</td>
                      <td style={{ padding: '0.55rem', fontFamily: 'monospace', fontSize: '0.78rem' }}>{u.clerk_user_id}</td>
                      <td style={{ padding: '0.55rem' }}>{u.account_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'sellers' && (
          <section className="fk-panel-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.9rem' }}>Artisan Profiles &amp; Listings (Live DB)</h2>
            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ padding: '0.55rem' }}>Workshop</th>
                    <th style={{ padding: '0.55rem' }}>District</th>
                    <th style={{ padding: '0.55rem' }}>Path / GI</th>
                    <th style={{ padding: '0.55rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(ov.sellers || []).map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '0.55rem', fontWeight: 600 }}>{s.store_name}</td>
                      <td style={{ padding: '0.55rem' }}>{s.workshop_district || '—'}</td>
                      <td style={{ padding: '0.55rem' }}>{s.verification_path} {s.claimed_gi_code ? `(${s.claimed_gi_code})` : ''}</td>
                      <td style={{ padding: '0.55rem' }}>{s.verification_status} / {s.profile_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 style={{ marginBottom: '0.65rem' }}>Active Craft Listings</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ padding: '0.55rem' }}>SKU</th>
                    <th style={{ padding: '0.55rem' }}>Title</th>
                    <th style={{ padding: '0.55rem' }}>Price</th>
                    <th style={{ padding: '0.55rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(ov.listings || []).map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '0.55rem', fontFamily: 'monospace' }}>{l.sku}</td>
                      <td style={{ padding: '0.55rem' }}>{l.title}</td>
                      <td style={{ padding: '0.55rem' }}>{inr(l.price)}</td>
                      <td style={{ padding: '0.55rem' }}>{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'orders' && (
          <section className="fk-panel-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.9rem' }}>Retail Orders (Live DB)</h2>
            {(ov.orders || []).length === 0 ? (
              <p style={{ opacity: 0.7 }}>No retail orders placed in the database yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '0.55rem' }}>Order #</th>
                      <th style={{ padding: '0.55rem' }}>Total</th>
                      <th style={{ padding: '0.55rem' }}>Method</th>
                      <th style={{ padding: '0.55rem' }}>Payment</th>
                      <th style={{ padding: '0.55rem' }}>Fulfilment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ov.orders || []).map((o) => (
                      <tr key={o.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <td style={{ padding: '0.55rem', fontFamily: 'monospace' }}>{o.order_number}</td>
                        <td style={{ padding: '0.55rem' }}>{inr(o.total_amount)}</td>
                        <td style={{ padding: '0.55rem' }}>{o.payment_method}</td>
                        <td style={{ padding: '0.55rem' }}>{o.payment_status}</td>
                        <td style={{ padding: '0.55rem' }}>{o.fulfilment_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'payments' && (
          <section className="fk-panel-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.9rem' }}>Razorpay Payments &amp; Refunds (Live DB)</h2>
            {data.payments.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No Razorpay payment records in the database yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '0.55rem' }}>Payment ID</th>
                      <th style={{ padding: '0.55rem' }}>Amount</th>
                      <th style={{ padding: '0.55rem' }}>Status</th>
                      <th style={{ padding: '0.55rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <td style={{ padding: '0.55rem', fontFamily: 'monospace', fontSize: '0.78rem' }}>{p.id}</td>
                        <td style={{ padding: '0.55rem' }}>{inr(p.amount)}</td>
                        <td style={{ padding: '0.55rem' }}>{p.status}</td>
                        <td style={{ padding: '0.55rem' }}>
                          {p.status === 'CAPTURED' && (
                            <button
                              type="button"
                              className="btn-orange-outline"
                              style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                              onClick={() => handleRefund(p)}
                            >
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'guardrails' && (
          <section className="fk-panel-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.9rem' }}>ASIGS Guardrail Review Queue (Live DB)</h2>
            {data.cases.length === 0 ? (
              <p style={{ opacity: 0.7 }}>No guardrail cases pending review.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.cases.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: '10px',
                      padding: '0.9rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem'
                    }}
                  >
                    <div>
                      <strong>{c.entity_type}</strong> &middot; {c.status} &middot; Risk: {c.risk_score}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn-orange"
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                        onClick={() => handleCaseDecision(c.id, 'APPROVED')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn-orange-outline"
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                        onClick={() => handleCaseDecision(c.id, 'REJECTED')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
