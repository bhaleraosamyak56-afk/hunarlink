import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../state/StoreContext.jsx';
import {
  clearPendingClerkAuthMode,
  clearPendingClerkRole,
  readClerkArtisanProfile,
  saveClerkArtisanProfile,
  useClerkBridge
} from '../data/clerkConfig.js';
import {
  canAttemptBackend,
  fetchMyAuthProfile,
  submitArtisanVerification,
  syncAuthenticatedUser
} from '../services/apiClient.js';
import { IconArrowRight, IconBadgeCheck, IconCheck, IconShield, IconSpark } from '../components/LineIcons.jsx';
import { hdSrcFor, srcSetFor } from '../data/imageVariants.js';
import '../styles/portal.css';

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28v-3.1H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l4-3.1z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.465 2.21-1.225 3.01-.79.83-2.08 1.47-3.2 1.38-.14-1.1.4-2.26 1.16-3.04.79-.82 2.13-1.42 3.265-1.35zM20.76 17.16c-.53 1.22-.79 1.77-1.48 2.85-.96 1.5-2.31 3.37-3.99 3.39-1.49.02-1.88-.97-3.9-.96-2.02.01-2.45.98-3.94.96-1.68-.02-2.96-1.7-3.92-3.2-2.69-4.2-2.97-9.13-1.31-11.73 1.18-1.85 3.05-2.94 4.81-2.94 1.79 0 2.91.98 4.39.98 1.44 0 2.31-.98 4.37-.98 1.56 0 3.21.85 4.39 2.32-3.86 2.12-3.23 7.64.58 9.31z" />
    </svg>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clerk = useClerkBridge();
  const { setUser, toast, hydrateFromBackend } = useStore();

  const [authMode, setAuthMode] = useState(
    params.get('mode') === 'register' || params.get('mode') === 'signup' ? 'register' : 'signin'
  );
  const [giMode, setGiMode] = useState('with_gi');
  const [form, setForm] = useState({
    storeName: '',
    phone: '',
    craft: 'pashmina',
    district: 'Srinagar',
    giId: '',
    terms: false
  });
  const [errMsg, setErrMsg] = useState('');
  const [busyProvider, setBusyProvider] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dbProfile, setDbProfile] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [editingForm, setEditingForm] = useState(params.get('edit') === '1');

  const clerkUser = clerk.clerkUser;
  const signedIn = Boolean(clerk.enabled && clerk.isSignedIn && clerkUser);
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || '';
  const clerkName =
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
    '';

  useEffect(() => {
    const reset = (ev) => {
      setBusyProvider(null);
      if (ev?.persisted) {
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
      }
    };
    window.addEventListener('pageshow', reset);
    window.addEventListener('focus', reset);
    return () => {
      window.removeEventListener('pageshow', reset);
      window.removeEventListener('focus', reset);
    };
  }, []);

  async function refreshLiveVerificationStatus() {
    if (!signedIn || !clerkUser) return;
    setCheckingStatus(true);
    try {
      if (canAttemptBackend() && clerk.getToken) {
        const token = await clerk.getToken();
        if (token) {
          const me = await fetchMyAuthProfile(token);
          setDbProfile(me);
          const seller = me?.seller_profile || null;
          if (seller) {
            setForm((prev) => ({
              ...prev,
              storeName: prev.storeName || seller.store_name || '',
              craft: seller.craft_specialty || prev.craft,
              district: seller.workshop_district || prev.district,
              phone: prev.phone || me?.phone || '',
              giId: prev.giId || seller.claimed_gi_authorized_user_no || ''
            }));
            setGiMode(seller.verification_path === 'GI' ? 'with_gi' : 'without_gi');
          }
          if (me?.artisan_verified && params.get('edit') !== '1') {
            saveClerkArtisanProfile(clerkUser.id, {
              artisanVerified: true,
              verificationStatus: 'APPROVED',
              business: seller?.store_name || '',
              craft: seller?.craft_specialty || '',
              district: seller?.workshop_district || '',
              giId: seller?.claimed_gi_authorized_user_no || null
            });
            setUser(
              {
                id: clerkUser.id,
                name: me?.display_name || clerkName || seller?.store_name || 'Verified Artisan',
                email: me?.email || clerkEmail,
                phone: me?.phone || '',
                role: 'artisan',
                isLoggedIn: true,
                authProvider: 'clerk',
                artisanVerified: true,
                verificationStatus: 'APPROVED',
                sellerProfile: seller,
                business: seller?.store_name || '',
                craft: seller?.craft_specialty || '',
                district: seller?.workshop_district || '',
                giId: seller?.claimed_gi_authorized_user_no || null
              },
              { silent: true }
            );
            navigate('/seller', { replace: true });
            return;
          }
        }
      } else {
        const saved = readClerkArtisanProfile(clerkUser.id);
        if (saved?.artisanVerified && params.get('edit') !== '1') {
          navigate('/seller', { replace: true });
        }
      }
    } catch {
      /* backend offline or first sync pending — keep verification form accessible */
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    refreshLiveVerificationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, clerkUser?.id]);

  async function launchOAuth(provider) {
    if (!clerk.enabled || !clerk.authenticateWithOAuth) {
      setErrMsg('Clerk authentication is not configured.');
      return;
    }
    setErrMsg('');
    setBusyProvider(provider);
    try {
      const res = await clerk.authenticateWithOAuth(provider, {
        role: 'artisan',
        mode: authMode === 'register' ? 'signup' : 'signin',
        redirectTo: '/auth?tab=verify'
      });
      if (res?.alreadySignedIn && res?.destination) {
        navigate(res.destination, { replace: true });
      }
    } catch (err) {
      setBusyProvider(null);
      setErrMsg(err?.message || 'Sign-in could not start.');
    }
  }

  async function submitVerification(e) {
    e.preventDefault();
    setErrMsg('');
    if (!signedIn || !clerkUser) {
      setErrMsg('Please sign in with Clerk first.');
      return;
    }
    if (!form.storeName.trim()) {
      setErrMsg('Enter your workshop or guild name.');
      return;
    }
    if (giMode === 'with_gi' && !form.giId.trim()) {
      setErrMsg('Enter your GI Certificate / Authorized User Registration Number.');
      return;
    }
    if (!form.terms) {
      setErrMsg('Please confirm the authenticity declaration.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await clerk.getToken();
      let savedSeller = null;
      if (canAttemptBackend() && token) {
        await syncAuthenticatedUser(
          {
            email: clerkEmail,
            email_verified: Boolean(
              clerkUser.primaryEmailAddress?.verification?.status === 'verified'
            ),
            first_name: clerkUser.firstName || clerkName.split(' ')[0] || 'Artisan',
            last_name: clerkUser.lastName || null,
            display_name: clerkName || form.storeName.trim(),
            phone: form.phone.trim() || null,
            requested_role: 'artisan',
            auth_mode: 'sync'
          },
          token
        );

        const verifyRes = await submitArtisanVerification(
          {
            store_name: form.storeName.trim(),
            craft_specialty: form.craft,
            workshop_district: form.district,
            verification_path: giMode === 'with_gi' ? 'GI' : 'NON_GI',
            claimed_gi_code: giMode === 'with_gi' ? form.giId.trim() : null,
            phone: form.phone.trim() || null
          },
          token
        );
        savedSeller = verifyRes?.seller_profile || null;
        await hydrateFromBackend(token);
      }

      const nextStatus = savedSeller?.verification_status || 'SUBMITTED';
      const isApprovedNow = nextStatus === 'APPROVED';
      const nextProfile = {
        artisanVerified: isApprovedNow,
        verificationStatus: nextStatus,
        business: form.storeName.trim(),
        craft: form.craft,
        district: form.district,
        phone: form.phone.trim(),
        giId: giMode === 'with_gi' ? form.giId.trim() : null,
        verificationPath: giMode === 'with_gi' ? 'GI' : 'NON_GI'
      };
      saveClerkArtisanProfile(clerkUser.id, nextProfile);
      setUser(
        {
          id: clerkUser.id,
          name: clerkName || form.storeName.trim(),
          email: clerkEmail,
          phone: form.phone.trim(),
          role: 'artisan',
          isLoggedIn: true,
          authProvider: 'clerk',
          artisanVerified: isApprovedNow,
          verificationStatus: nextStatus,
          sellerProfile: savedSeller,
          business: form.storeName.trim(),
          craft: form.craft,
          district: form.district,
          giId: nextProfile.giId
        },
        { silent: true }
      );
      setDbProfile((prev) => ({
        ...(prev || {}),
        artisan_verified: isApprovedNow,
        seller_profile: savedSeller || {
          store_name: form.storeName.trim(),
          craft_specialty: form.craft,
          workshop_district: form.district,
          verification_path: giMode === 'with_gi' ? 'GI' : 'NON_GI',
          verification_status: nextStatus,
          profile_status: 'DRAFT',
          claimed_gi_authorized_user_no: giMode === 'with_gi' ? form.giId.trim() : null
        }
      }));
      setEditingForm(false);
      if (isApprovedNow) {
        toast('Artisan verification approved! Opening Artisan Workspace.', 'success');
        navigate('/seller', { replace: true });
      } else {
        toast(
          'Artisan verification submitted to HunarLink database! Pending Admin approval.',
          'success'
        );
      }
    } catch (err) {
      setErrMsg(err?.message || 'Could not submit artisan verification to the database.');
    } finally {
      setSubmitting(false);
    }
  }

  const liveSeller = dbProfile?.seller_profile || null;
  const liveStatus = liveSeller?.verification_status || 'UNVERIFIED';
  const showPendingCard = signedIn && liveStatus === 'SUBMITTED' && !editingForm;

  return (
    <div className="portal-page login-page">
      <header className="up-header">
        <div className="up-header-inner">
          <Link to={signedIn ? '/' : '/login'} className="up-brand">
            <img
              src={`${import.meta.env.BASE_URL}img/brand/logo.svg`}
              alt=""
              className="up-emblem-mark"
              height="38"
            />
            <div>
              <div className="up-brand-title">HunarLink</div>
              <div className="up-brand-sub">Artisan Onboarding &amp; GI Verification</div>
            </div>
          </Link>
          <nav className="up-nav-links">
            <Link to="/login" className="up-nav-pill">
              Buyer Sign In
            </Link>
            {signedIn && (
              <button
                type="button"
                className="up-nav-pill"
                onClick={async () => {
                  if (clerk.signOutClerk) await clerk.signOutClerk();
                  navigate('/login', { replace: true });
                }}
              >
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="login-shell" id="main-content">
        <div className="login-ambient" aria-hidden="true">
          <picture>
            {srcSetFor('img/artisan-loom-light.jpg') && (
              <source
                type="image/webp"
                srcSet={srcSetFor('img/artisan-loom-light.jpg')}
                sizes="100vw"
              />
            )}
            <img
              className="login-ambient-img"
              src={`${import.meta.env.BASE_URL}img/artisan-loom-light.jpg`}
              alt=""
            />
          </picture>
        </div>

        <section className="login-card">
          <div className="login-left">
            <div
              className="login-rail-photo"
              aria-hidden="true"
              style={{ backgroundImage: `url("${hdSrcFor('img/artisan-loom-dark.jpg')}")` }}
            />
            <div>
              <div className="login-pill">
                <IconSpark size={11} />
                Artisan Guild Registry
              </div>
              <h1>Kashmiri Artisan Verification</h1>
              <p>
                Every artisan on HunarLink verifies their identity via Clerk and submits either a
                GI Authorized User certificate or a Standard Artisan workshop application stored
                directly in our database.
              </p>
            </div>
            <ul className="login-perks">
              <li><IconBadgeCheck size={14} /> Direct database registration in seller_profiles</li>
              <li><IconShield size={14} /> Zero unverified or anonymous craft listings</li>
            </ul>
          </div>

          <div className="login-right">
            {!signedIn ? (
              <>
                <div className="login-head">
                  <h2 className="login-title">
                    {authMode === 'register'
                      ? 'Step 1: Register Artisan Account'
                      : 'Step 1: Artisan Sign In'}
                  </h2>
                  <p className="login-sub">
                    {authMode === 'register'
                      ? 'New artisans register below. Already registered in our DB? Switch to Sign In — existing accounts cannot re-register.'
                      : 'Sign in with Google or Apple. Unverified artisans will proceed straight to Verification.'}
                  </p>
                </div>

                <div className="seg" style={{ marginBottom: '0.9rem' }}>
                  <span className="seg-label">Action</span>
                  <div className="seg-track">
                    <button
                      type="button"
                      className={`seg-btn${authMode === 'signin' ? ' is-on' : ''}`}
                      onClick={() => {
                        setAuthMode('signin');
                        setErrMsg('');
                      }}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${authMode === 'register' ? ' is-on' : ''}`}
                      onClick={() => {
                        setAuthMode('register');
                        setErrMsg('');
                      }}
                    >
                      Register
                    </button>
                  </div>
                </div>

                {errMsg && (
                  <div className="login-error show" role="alert" style={{ marginBottom: '0.85rem' }}>
                    {errMsg}
                  </div>
                )}
                {clerk.enabled ? (
                  <div className="login-social-section">
                    <div className="login-social-stack">
                      <button
                        type="button"
                        className="login-social-btn"
                        disabled={Boolean(busyProvider) || !clerk.isLoaded}
                        onClick={() => launchOAuth('google')}
                      >
                        <GoogleGlyph />
                        <span>
                          {busyProvider === 'google'
                            ? 'Redirecting…'
                            : authMode === 'register'
                              ? 'Register with Google'
                              : 'Sign in with Google'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="login-social-btn"
                        disabled={Boolean(busyProvider) || !clerk.isLoaded}
                        onClick={() => launchOAuth('apple')}
                      >
                        <AppleGlyph />
                        <span>
                          {busyProvider === 'apple'
                            ? 'Redirecting…'
                            : authMode === 'register'
                              ? 'Register with Apple'
                              : 'Sign in with Apple'}
                        </span>
                      </button>
                    </div>
                    <p className="login-footer-note" style={{ marginTop: '0.85rem' }}>
                      Prefer email code? Use <Link to={`/login?role=artisan&mode=${authMode}`}>Artisan Email {authMode === 'register' ? 'Registration' : 'Sign In'}</Link>.
                    </p>
                  </div>
                ) : (
                  <div className="login-error show" role="alert">
                    Clerk authentication must be configured in <code>app/.env.local</code>.
                  </div>
                )}
              </>
            ) : showPendingCard ? (
              <div>
                <div className="login-head">
                  <h2 className="login-title">Artisan Verification Under Review</h2>
                  <p className="login-sub">
                    Signed in as <strong>{clerkName || clerkEmail}</strong> ({clerkEmail})
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(180, 83, 9, 0.08)',
                    border: '1px solid rgba(180, 83, 9, 0.25)',
                    borderRadius: '10px',
                    padding: '1rem 1.15rem',
                    marginBottom: '1rem',
                    fontSize: '0.88rem',
                    lineHeight: 1.55
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
                    Status: SUBMITTED (Pending Admin Approval)
                  </div>
                  <div>Workshop: <strong>{liveSeller?.store_name || form.storeName}</strong></div>
                  <div>District: <strong>{liveSeller?.workshop_district || form.district}</strong></div>
                  <div>
                    Path: <strong>{liveSeller?.verification_path === 'GI' ? 'GI Certified' : 'Standard Artisan'}</strong>
                    {liveSeller?.claimed_gi_authorized_user_no
                      ? ` (${liveSeller.claimed_gi_authorized_user_no})`
                      : ''}
                  </div>
                  <p style={{ margin: '0.6rem 0 0', opacity: 0.85 }}>
                    Your Seller Workspace unlocks automatically once a HunarLink Admin approves your
                    application in <code>/admin</code>. Until then, signing in always brings you
                    here first.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <button
                    type="button"
                    className="btn-orange"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={checkingStatus}
                    onClick={refreshLiveVerificationStatus}
                  >
                    <IconCheck size={15} />
                    {checkingStatus ? 'Checking Database Status…' : 'Refresh Verification Status'}
                  </button>
                  <button
                    type="button"
                    className="btn-orange-outline"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setEditingForm(true)}
                  >
                    Edit / Update Workshop Application
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitVerification}>
                <div className="login-head">
                  <h2 className="login-title">Step 2: Workshop &amp; GI Verification</h2>
                  <p className="login-sub">
                    Signed in as <strong>{clerkName || clerkEmail}</strong> ({clerkEmail})
                  </p>
                </div>

                {liveStatus === 'REJECTED' && (
                  <div className="login-error show" role="alert" style={{ marginBottom: '0.85rem' }}>
                    Your previous artisan verification application was rejected. Please review and
                    resubmit your workshop &amp; GI details below.
                  </div>
                )}

                {errMsg && (
                  <div className="login-error show" role="alert" style={{ marginBottom: '0.85rem' }}>
                    {errMsg}
                  </div>
                )}

                <div className="seg" style={{ marginBottom: '1rem' }}>
                  <span className="seg-label">Track</span>
                  <div className="seg-track">
                    <button
                      type="button"
                      className={`seg-btn${giMode === 'with_gi' ? ' is-on' : ''}`}
                      onClick={() => setGiMode('with_gi')}
                    >
                      GI Certified
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${giMode === 'without_gi' ? ' is-on' : ''}`}
                      onClick={() => setGiMode('without_gi')}
                    >
                      Standard Artisan
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label className="up-label" htmlFor="art-store">
                    Workshop / Guild Name *
                  </label>
                  <input
                    id="art-store"
                    type="text"
                    className="up-input"
                    placeholder="e.g. Valley Loom Atelier"
                    required
                    value={form.storeName}
                    onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
                  />
                </div>

                <div className="up-grid-2">
                  <div className="form-field">
                    <label className="up-label" htmlFor="art-craft">Craft Guild *</label>
                    <select
                      id="art-craft"
                      className="up-select"
                      value={form.craft}
                      onChange={(e) => setForm((f) => ({ ...f, craft: e.target.value }))}
                    >
                      <option value="pashmina">Pashmina Textiles</option>
                      <option value="carpets">Silk-on-Silk Carpets</option>
                      <option value="woodwork">Walnut Woodcarving</option>
                      <option value="papier-mache">Papier-Mâché Art</option>
                      <option value="sozni">Sozni Embroidery</option>
                      <option value="copperware">Copperware</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="up-label" htmlFor="art-district">District *</label>
                    <select
                      id="art-district"
                      className="up-select"
                      value={form.district}
                      onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                    >
                      <option value="Srinagar">Srinagar</option>
                      <option value="Budgam">Budgam</option>
                      <option value="Anantnag">Anantnag</option>
                      <option value="Baramulla">Baramulla</option>
                      <option value="Pulwama">Pulwama</option>
                      <option value="Ganderbal">Ganderbal</option>
                      <option value="Bandipora">Bandipora</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label className="up-label" htmlFor="art-phone">Workshop Phone *</label>
                  <input
                    id="art-phone"
                    type="tel"
                    className="up-input"
                    placeholder="+91 94190 XXXXX"
                    required
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>

                {giMode === 'with_gi' && (
                  <div className="form-field">
                    <label className="up-label" htmlFor="art-gi">
                      GI Registration / Authorized User Number *
                    </label>
                    <input
                      id="art-gi"
                      type="text"
                      className="up-input"
                      placeholder="e.g. GI-JK-PASH-8821"
                      required
                      value={form.giId}
                      onChange={(e) => setForm((f) => ({ ...f, giId: e.target.value }))}
                    />
                  </div>
                )}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    fontSize: '0.84rem',
                    margin: '0.75rem 0 1rem'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.terms}
                    onChange={(e) => setForm((f) => ({ ...f, terms: e.target.checked }))}
                  />
                  <span>
                    I declare that all craft details and GI identifiers submitted are genuine and
                    produced in Jammu &amp; Kashmir.
                  </span>
                </label>

                <button
                  type="submit"
                  className="btn-orange"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={submitting}
                >
                  <IconCheck size={15} />
                  {submitting ? 'Saving to database…' : 'Submit Artisan Verification'}
                  <IconArrowRight size={14} />
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
