import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PortalScope from '../../components/PortalScope.jsx';
import { IconArrowRight, IconShield } from '../../components/LineIcons.jsx';
import { clearPendingClerkRole, useClerkBridge } from '../../data/clerkConfig.js';
import { srcSetFor } from '../../data/imageVariants.js';
import '../../styles/admin-login.css';

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

export default function AdminLoginPage({ deniedEmail = null, deniedReason = null, checking = false }) {
  const navigate = useNavigate();
  const clerk = useClerkBridge();
  const [busyProvider, setBusyProvider] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const reset = (ev) => {
      setBusyProvider(null);
      if (ev?.persisted) clearPendingClerkRole();
    };
    window.addEventListener('pageshow', reset);
    window.addEventListener('focus', reset);
    return () => {
      window.removeEventListener('pageshow', reset);
      window.removeEventListener('focus', reset);
    };
  }, []);

  async function signInAdmin(provider) {
    if (!clerk.enabled || !clerk.authenticateWithOAuth) {
      setError('Clerk authentication is required for Admin access.');
      return;
    }
    setError('');
    setBusyProvider(provider);
    try {
      await clerk.authenticateWithOAuth(provider, {
        role: 'buyer',
        mode: 'signin',
        redirectTo: '/admin'
      });
    } catch (err) {
      setBusyProvider(null);
      setError(err?.message || 'Could not start administrator sign-in.');
    }
  }

  async function signOutAdmin() {
    if (clerk.signOutClerk) await clerk.signOutClerk();
    navigate('/', { replace: true });
  }

  return (
    <>
      <PortalScope family="admin" />
      <header className="admin-login-topbar">
        <div className="admin-login-topbar-inner">
          <Link to="/" className="admin-login-brand" aria-label="HunarLink storefront">
            <img src={`${import.meta.env.BASE_URL}img/brand/logo.svg`} alt="" />
            <span>
              <strong>HunarLink</strong>
              <small>ADMIN CONSOLE</small>
            </span>
          </Link>
          <Link to="/" className="admin-login-storefront">
            <span aria-hidden="true">&larr;</span> Storefront
          </Link>
        </div>
      </header>

      <main className="admin-login-page" id="main-content">
        <div className="admin-login-backdrop" aria-hidden="true">
          <picture>
            {srcSetFor('img/artisan-loom-light.jpg') && (
              <source
                type="image/webp"
                srcSet={srcSetFor('img/artisan-loom-light.jpg')}
                sizes="100vw"
              />
            )}
            <img
              src={`${import.meta.env.BASE_URL}img/artisan-loom-light.jpg`}
              alt=""
              loading="eager"
              decoding="async"
            />
          </picture>
        </div>

        <section className="admin-login-card" style={{ maxWidth: '520px', margin: '0 auto' }}>
          <div className="admin-login-badge">
            <IconShield size={14} />
            <span>DATABASE-VERIFIED RBAC ACCESS</span>
          </div>

          {checking ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center' }}>
              <h1 style={{ fontSize: '1.45rem', marginBottom: '0.5rem' }}>
                Verifying Administrator Privileges&hellip;
              </h1>
              <p style={{ opacity: 0.72, fontSize: '0.9rem' }}>
                Validating your Clerk RS256 session against HunarLink&rsquo;s admin RBAC tables.
              </p>
            </div>
          ) : deniedEmail ? (
            <div style={{ padding: '0.75rem 0' }}>
              <h1 style={{ fontSize: '1.55rem', color: '#991b1b', marginBottom: '0.5rem' }}>
                403 &mdash; Access Denied
              </h1>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.55, marginBottom: '1rem' }}>
                Signed-in account <strong>{deniedEmail}</strong> does not have active Administrator
                privileges in the HunarLink database.
              </p>
              {deniedReason && (
                <div className="login-error show" role="alert" style={{ marginBottom: '1rem' }}>
                  {deniedReason}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <Link
                  to="/"
                  className="btn-orange"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  &larr; Return to Storefront
                </Link>
                <button
                  type="button"
                  className="btn-orange-outline"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={signOutAdmin}
                >
                  Sign out and switch account
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h1 style={{ fontSize: '1.6rem', marginBottom: '0.45rem' }}>
                Administrator Sign In
              </h1>
              <p style={{ fontSize: '0.9rem', opacity: 0.78, marginBottom: '1.25rem' }}>
                Restricted to HunarLink staff with an active <code>ADMIN</code> record in the
                database. Normal user and artisan accounts are automatically rejected with HTTP 403.
              </p>

              {error && (
                <div className="login-error show" role="alert" style={{ marginBottom: '0.9rem' }}>
                  {error}
                </div>
              )}

              {clerk.enabled ? (
                <div className="login-social-section">
                  <div className="login-social-stack">
                    <button
                      type="button"
                      className="login-social-btn"
                      disabled={Boolean(busyProvider) || !clerk.isLoaded}
                      onClick={() => signInAdmin('google')}
                    >
                      <GoogleGlyph />
                      <span>
                        {busyProvider === 'google' ? 'Redirecting…' : 'Sign in with Google (Admin)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="login-social-btn"
                      disabled={Boolean(busyProvider) || !clerk.isLoaded}
                      onClick={() => signInAdmin('apple')}
                    >
                      <AppleGlyph />
                      <span>
                        {busyProvider === 'apple' ? 'Redirecting…' : 'Sign in with Apple (Admin)'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="login-error show" role="alert">
                  Admin console requires live Clerk authentication and a connected FastAPI database.
                </div>
              )}

              <div style={{ marginTop: '1.2rem', fontSize: '0.82rem', opacity: 0.75 }}>
                <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  Buyer / Artisan Sign In <IconArrowRight size={13} />
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
