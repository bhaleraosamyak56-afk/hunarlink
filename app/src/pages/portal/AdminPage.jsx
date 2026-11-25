import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/portal.css';
import PortalScope from '../../components/PortalScope.jsx';
import { useStore } from '../../state/StoreContext.jsx';
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
  initiateAdminRefund,
  moderateAdminListing,
  verifyAdminSeller
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
   AdminPage — Dedicated DB-Verified Email + Password Administrator Console
   --------------------------------------------------------------------------
   Uses an isolated signed HS256 Admin Session JWT issued ONLY by
   `POST /api/v1/auth/admin-login` for accounts explicitly provisioned in the
   database `admin_credentials` table. Re-validated live on every request.
   ========================================================================== */

const ADMIN_TOKEN_KEY = 'hunarlink_admin_session_jwt';

const TABS = [
  { id: 'overview', label: 'Overview & Users', icon: <IconGrid size={15} /> },
  { id: 'admins', label: 'Admin DB Accounts', icon: <IconShield size={15} /> },
  { id: 'sellers', label: 'Artisans & Listings', icon: <IconPalette size={15} /> },
  { id: 'orders', label: 'Retail Orders', icon: <IconPackage size={15} /> },
  { id: 'payments', label: 'Payments & Refunds', icon: <IconReceipt size={15} /> },
  { id: 'guardrails', label: 'ASIGS Guardrails', icon: <IconShield size={15} /> }
];

const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function readStoredAdminToken() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredAdminToken(token) {
  try {
    if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { toast } = useStore();

  const [adminToken, setAdminToken] = useState(() => readStoredAdminToken());
  const [authState, setAuthState] = useState(() => ({
    status: readStoredAdminToken() ? 'checking' : 'unauthenticated',
    email: null,
    notice: null,
    profile: null
  }));
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [revealedHashes, setRevealedHashes] = useState({});
  const [data, setData] = useState({
    overview: null,
    payments: [],
    refunds: [],
    webhooks: [],
    cases: [],
    rules: []
  });

  const clearAdminSession = useCallback((notice = null) => {
    writeStoredAdminToken('');
    setAdminToken('');
    setData({
      overview: null,
      payments: [],
      refunds: [],
      webhooks: [],
      cases: [],
      rules: []
    });
    setAuthState({
      status: 'unauthenticated',
      email: null,
      notice,
      profile: null
    });
  }, []);

  const loadLiveAdminData = useCallback(
    async (explicitToken = null) => {
      const token = explicitToken ?? adminToken;
      if (!token) {
        setAuthState({ status: 'unauthenticated', email: null, notice: null, profile: null });
        return;
      }

      if (!canAttemptBackend()) {
        clearAdminSession('Live FastAPI backend is required to access the Admin Console.');
        return;
      }

      setAuthState((prev) => ({
        ...prev,
        status: prev.status === 'authorized' ? 'authorized' : 'checking',
        notice: null
      }));

      try {
        const me = await fetchMyAuthProfile(token);
        if (!me?.is_admin) {
          clearAdminSession(
            'This administrator session is no longer active or authorized in the database.'
          );
          return;
        }

        setAuthState({
          status: 'authorized',
          email: me.email,
          notice: null,
          profile: me
        });
        setLoading(true);

        const [overview, payments, refunds, webhooks, cases, rules] = await Promise.all([
          fetchAdminOverview(token),
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
        clearAdminSession(
          err?.message || 'Administrator session expired or revoked. Please sign in again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [adminToken, clearAdminSession]
  );

  useEffect(() => {
    if (adminToken) {
      loadLiveAdminData(adminToken);
    }
  }, [adminToken, loadLiveAdminData]);

  async function handleAdminAuthenticated(loginResponse) {
    const token = loginResponse?.access_token;
    if (!token) return;
    writeStoredAdminToken(token);
    setAdminToken(token);
    await loadLiveAdminData(token);
  }

  async function handleRefund(payment) {
    const reason = window.prompt(
      `Refund reason for ${payment.payment_reference || payment.id} (min 5 chars):`
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) toast('Refund reason must be at least 5 characters.', 'error');
      return;
    }
    try {
      await initiateAdminRefund(
        payment.id,
        {
          refund_type: 'FULL',
          reason: reason.trim(),
          idempotency_key: generateIdempotencyKey('refund')
        },
        adminToken
      );
      toast('Full refund submitted to Razorpay & recorded in database.', 'success');
      loadLiveAdminData(adminToken);
    } catch (err) {
      toast(err?.message || 'Refund failed.', 'error');
    }
  }

  async function handleCaseDecision(caseId, decision) {
    const reason = window.prompt(`Audit reason for ${decision} (min 5 chars):`);
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) toast('Decision reason must be at least 5 characters.', 'error');
      return;
    }
    try {
      await decideAdminGuardrailCase(
        caseId,
        { decision, reason: reason.trim() },
        adminToken
      );
      toast(`Guardrail case marked ${decision}.`, 'success');
      loadLiveAdminData(adminToken);
    } catch (err) {
      toast(err?.message || 'Could not record decision.', 'error');
    }
  }

  async function handleModerateListing(listingId, nextStatus) {
    try {
      await moderateAdminListing(listingId, nextStatus, adminToken);
      toast(`Craft listing status updated to ${nextStatus}.`, 'success');
      loadLiveAdminData(adminToken);
    } catch (err) {
      toast(err?.message || 'Could not update listing status.', 'error');
    }
  }

  async function handleVerifySeller(sellerId, decision) {
    try {
      await verifyAdminSeller(sellerId, decision, adminToken);
      toast(`Artisan verification marked ${decision}.`, 'success');
      loadLiveAdminData(adminToken);
    } catch (err) {
      toast(err?.message || 'Could not update artisan verification.', 'error');
    }
  }

  if (authState.status === 'checking') {
    return <AdminLoginPage checking />;
  }
  if (authState.status !== 'authorized') {
    return (
      <AdminLoginPage
        onAuthenticated={handleAdminAuthenticated}
        sessionNotice={authState.notice}
      />
    );
  }

  const ov = data.overview || {
    counts: {},
    admin_credentials: [],
    users: [],
    sellers: [],
    listings: [],
    orders: []
  };

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
              onClick={() => {
                clearAdminSession(null);
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
            onClick={() => loadLiveAdminData(adminToken)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh Live DB'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}
        >
          <div className="fk-panel-card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.78rem', opacity: 0.7 }}>AUTHORIZED ADMINS</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{ov.counts?.admins ?? 0}</div>
          </div>
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
                    <th style={{ padding: '0.55rem' }}>Identity ID</th>
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

        {tab === 'admins' && (
          <section className="fk-panel-card" style={{ padding: '1.25rem' }}>
            <h2 style={{ marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <IconShield size={18} /> Authorized Admin Accounts (<code>admin_credentials</code> Table)
            </h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.78, marginBottom: '1rem' }}>
              Only active accounts listed in the <code>admin_credentials</code> database table can
              sign in at <code>/admin</code>. Passwords are stored securely as salted{' '}
              <code>PBKDF2-HMAC-SHA256</code> hashes (390,000 iterations) &mdash; never plaintext.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ padding: '0.55rem' }}>Admin Name</th>
                    <th style={{ padding: '0.55rem' }}>Authorized Email</th>
                    <th style={{ padding: '0.55rem' }}>Stored Password Credential (DB Hash)</th>
                    <th style={{ padding: '0.55rem' }}>Status</th>
                    <th style={{ padding: '0.55rem' }}>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {(ov.admin_credentials || []).map((a) => {
                    const shown = Boolean(revealedHashes[a.id]);
                    const maskedHash = a.password_hash
                      ? `${a.password_hash.slice(0, 22)}••••••••••••`
                      : '—';
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <td style={{ padding: '0.55rem', fontWeight: 600 }}>{a.name}</td>
                        <td style={{ padding: '0.55rem', fontWeight: 600 }}>{a.email}</td>
                        <td style={{ padding: '0.55rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ wordBreak: 'break-all' }}>
                              {shown ? a.password_hash : maskedHash}
                            </span>
                            <button
                              type="button"
                              className="btn-orange-outline"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                              onClick={() =>
                                setRevealedHashes((prev) => ({ ...prev, [a.id]: !prev[a.id] }))
                              }
                            >
                              {shown ? 'Hide Hash' : 'Show DB Hash'}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '0.55rem', fontWeight: 600 }}>
                          {a.is_active ? 'ACTIVE' : 'REVOKED'}
                        </td>
                        <td style={{ padding: '0.55rem', fontSize: '0.8rem' }}>
                          {a.last_login_at ? new Date(a.last_login_at).toLocaleString() : 'Never'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.8rem', opacity: 0.72, marginTop: '1rem' }}>
              Provision, rotate passwords, or revoke accounts directly on your database server with:{' '}
              <code>python backend/scripts/create_admin_account.py --email &quot;...&quot; --password &quot;...&quot; --name &quot;...&quot;</code>
            </p>
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
                    <th style={{ padding: '0.55rem' }}>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {(ov.sellers || []).map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '0.55rem', fontWeight: 600 }}>{s.store_name}</td>
                      <td style={{ padding: '0.55rem' }}>{s.workshop_district || '—'}</td>
                      <td style={{ padding: '0.55rem' }}>{s.verification_path} {s.claimed_gi_code ? `(${s.claimed_gi_code})` : ''}</td>
                      <td style={{ padding: '0.55rem' }}>{s.verification_status} / {s.profile_status}</td>
                      <td style={{ padding: '0.55rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {s.verification_status !== 'APPROVED' && (
                            <button
                              type="button"
                              className="btn-orange"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => handleVerifySeller(s.id, 'APPROVED')}
                            >
                              Approve Artisan
                            </button>
                          )}
                          {s.verification_status !== 'REJECTED' && (
                            <button
                              type="button"
                              className="btn-orange-outline"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => handleVerifySeller(s.id, 'REJECTED')}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 style={{ marginBottom: '0.65rem' }}>Craft Listings (Approve / Moderate Live DB)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ padding: '0.55rem' }}>SKU</th>
                    <th style={{ padding: '0.55rem' }}>Title</th>
                    <th style={{ padding: '0.55rem' }}>Price</th>
                    <th style={{ padding: '0.55rem' }}>Status</th>
                    <th style={{ padding: '0.55rem' }}>Moderation</th>
                  </tr>
                </thead>
                <tbody>
                  {(ov.listings || []).map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '0.55rem', fontFamily: 'monospace' }}>{l.sku}</td>
                      <td style={{ padding: '0.55rem' }}>{l.title}</td>
                      <td style={{ padding: '0.55rem' }}>{inr(l.price)}</td>
                      <td style={{ padding: '0.55rem', fontWeight: 600 }}>{l.status}</td>
                      <td style={{ padding: '0.55rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {l.status !== 'ACTIVE' && (
                            <button
                              type="button"
                              className="btn-orange"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => handleModerateListing(l.id, 'ACTIVE')}
                            >
                              Approve Live
                            </button>
                          )}
                          {l.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="btn-orange-outline"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => handleModerateListing(l.id, 'PAUSED')}
                            >
                              Pause
                            </button>
                          )}
                          {l.status !== 'REJECTED' && (
                            <button
                              type="button"
                              className="btn-orange-outline"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => handleModerateListing(l.id, 'REJECTED')}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
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
              <p style={{ opacity: 0.7, marginBottom: '1.25rem' }}>
                No Razorpay payment records in the database yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '0.55rem' }}>Reference</th>
                      <th style={{ padding: '0.55rem' }}>Provider Payment</th>
                      <th style={{ padding: '0.55rem' }}>Amount / Captured</th>
                      <th style={{ padding: '0.55rem' }}>Refunded</th>
                      <th style={{ padding: '0.55rem' }}>Status</th>
                      <th style={{ padding: '0.55rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => {
                      const pStatus = p.payment_status || p.status || '—';
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                          <td style={{ padding: '0.55rem', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {p.payment_reference || p.id}
                          </td>
                          <td style={{ padding: '0.55rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                            {p.provider_payment_id || p.provider_order_id || '—'}
                          </td>
                          <td style={{ padding: '0.55rem' }}>
                            {inr(p.amount)} / {inr(p.captured_amount)}
                          </td>
                          <td style={{ padding: '0.55rem' }}>{inr(p.refunded_amount)}</td>
                          <td style={{ padding: '0.55rem', fontWeight: 600 }}>{pStatus}</td>
                          <td style={{ padding: '0.55rem' }}>
                            {pStatus === 'CAPTURED' && (
                              <button
                                type="button"
                                className="btn-orange-outline"
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                                onClick={() => handleRefund(p)}
                              >
                                Full Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <h3 style={{ marginBottom: '0.65rem' }}>Refund Ledger ({data.refunds.length})</h3>
            {data.refunds.length === 0 ? (
              <p style={{ opacity: 0.7, marginBottom: '1.25rem', fontSize: '0.86rem' }}>
                No refunds initiated yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '0.5rem' }}>Refund Ref</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>Amount</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.refunds.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                          {r.refund_reference}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{r.refund_type}</td>
                        <td style={{ padding: '0.5rem' }}>{inr(r.amount)}</td>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{r.refund_status}</td>
                        <td style={{ padding: '0.5rem' }}>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 style={{ marginBottom: '0.65rem' }}>Razorpay Webhook Events ({data.webhooks.length})</h3>
            {data.webhooks.length === 0 ? (
              <p style={{ opacity: 0.7, fontSize: '0.86rem' }}>No webhook deliveries recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '0.5rem' }}>Event ID</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>HMAC Verified</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.webhooks.map((w) => (
                      <tr key={w.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                          {w.provider_event_id}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{w.event_type}</td>
                        <td style={{ padding: '0.5rem' }}>{w.signature_verified ? 'YES' : 'NO'}</td>
                        <td style={{ padding: '0.5rem' }}>{w.processing_status}</td>
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
              <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
                No guardrail cases pending review.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
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
                      gap: '1rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <div>
                        <strong>{c.case_number}</strong> &middot; {c.workflow_name} ({c.target_type})
                      </div>
                      <div style={{ fontSize: '0.82rem', opacity: 0.78, marginTop: '0.2rem' }}>
                        Outcome: <strong>{c.guardrail_outcome}</strong> &middot; Case:{' '}
                        <strong>{c.case_status}</strong>
                        {Array.isArray(c.reason_codes) && c.reason_codes.length > 0 && (
                          <> &middot; Rules: <code>{c.reason_codes.join(', ')}</code></>
                        )}
                      </div>
                      {c.decision_reason && (
                        <div style={{ fontSize: '0.8rem', opacity: 0.72, marginTop: '0.2rem' }}>
                          Decision note: {c.decision_reason}
                        </div>
                      )}
                    </div>
                    {c.case_status === 'OPEN' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn-orange"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => handleCaseDecision(c.id, 'APPROVE')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-orange-outline"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => handleCaseDecision(c.id, 'REJECT')}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h3 style={{ marginBottom: '0.65rem' }}>Active ASIGS Guardrail Rules ({data.rules.length})</h3>
            {data.rules.length === 0 ? (
              <p style={{ opacity: 0.7, fontSize: '0.85rem' }}>No rules seeded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '0.5rem' }}>Rule Code</th>
                      <th style={{ padding: '0.5rem' }}>Layer</th>
                      <th style={{ padding: '0.5rem' }}>Description</th>
                      <th style={{ padding: '0.5rem' }}>Default Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rules.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                          {r.rule_code}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{r.layer}</td>
                        <td style={{ padding: '0.5rem' }}>{r.name}</td>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{r.default_outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
