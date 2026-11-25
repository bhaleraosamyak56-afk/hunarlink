import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PortalScope from '../../components/PortalScope.jsx';
import {
  IconArrowRight,
  IconCheck,
  IconShield
} from '../../components/LineIcons.jsx';
import { adminPasswordLogin, canAttemptBackend } from '../../services/apiClient.js';
import { srcSetFor } from '../../data/imageVariants.js';
import '../../styles/admin-login.css';

/* ==========================================================================
   AdminLoginPage — Dedicated Allowlisted Email + Password Admin Sign-In
   --------------------------------------------------------------------------
   Strictly restricted to 1-2 database-provisioned administrators in
   `admin_credentials`. No self-registration, no Clerk OAuth, and zero
   hardcoded or prefilled credentials.
   ========================================================================== */

export default function AdminLoginPage({
  onAuthenticated,
  sessionNotice = null,
  checking = false
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Enter both your authorized administrator email and password.');
      return;
    }

    if (!canAttemptBackend()) {
      setError(
        'The live HunarLink FastAPI backend is required to verify administrator credentials against the database.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await adminPasswordLogin({ email: trimmedEmail, password });
      setPassword('');
      if (onAuthenticated) {
        await onAuthenticated(result);
      }
    } catch (err) {
      setError(err?.message || 'Invalid administrator email or password.');
    } finally {
      setSubmitting(false);
    }
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

        <section className="admin-login-card" aria-label="Administrator sign in">
          <aside className="admin-login-rail">
            <div className="admin-login-rail-content">
              <div className="admin-login-rail-badge">
                <IconShield size={12} />
                <span>RESTRICTED ADMIN ALLOWLIST</span>
              </div>
              <h1>HunarLink Governance Console</h1>
              <p>
                Dedicated administrator access verified directly against HunarLink&rsquo;s
                database credential vault and active RBAC permissions.
              </p>
            </div>

            <ul className="admin-login-privileges">
              <li>
                <IconCheck size={13} />
                <span>Restricted strictly to database-provisioned admin accounts</span>
              </li>
              <li>
                <IconCheck size={13} />
                <span>PBKDF2-SHA256 salted password verification &amp; rate-limited auth</span>
              </li>
              <li>
                <IconCheck size={13} />
                <span>Live visibility of users, artisans, orders, payments &amp; ASIGS</span>
              </li>
              <li>
                <IconCheck size={13} />
                <span>Instant server-side session revocation via database status</span>
              </li>
            </ul>
          </aside>

          <div className="admin-login-form-panel">
            {checking ? (
              <div className="admin-login-form-heading" style={{ marginBottom: 0 }}>
                <p className="admin-login-eyebrow">VERIFYING SESSION</p>
                <h2>Checking Admin Access&hellip;</h2>
                <p>
                  Validating your signed administrator session token against the live database.
                </p>
              </div>
            ) : (
              <>
                <div className="admin-login-form-heading">
                  <p className="admin-login-eyebrow">AUTHORIZED ADMINISTRATORS ONLY</p>
                  <h2>Admin Sign In</h2>
                  <p>
                    Enter your database-provisioned administrator email and password. Public
                    registration is permanently disabled for this portal.
                  </p>
                </div>

                {(error || sessionNotice) && (
                  <div className="admin-login-error" role="alert">
                    {error || sessionNotice}
                  </div>
                )}

                <form id="admin-login-page-form" onSubmit={handleSubmit} noValidate>
                  <div className="admin-login-field">
                    <label htmlFor="admin-email">Administrator Email</label>
                    <input
                      id="admin-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      placeholder="authorized-admin@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>

                  <div className="admin-login-field">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <label htmlFor="admin-password">Password</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        style={{
                          background: 'none',
                          border: 0,
                          padding: 0,
                          color: '#8f6b43',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      id="admin-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter administrator password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="admin-login-submit"
                    disabled={submitting}
                  >
                    <span>{submitting ? 'Verifying Credentials…' : 'Sign In to Admin Console'}</span>
                    {!submitting && <IconArrowRight size={13} />}
                  </button>
                </form>

                <div className="admin-login-demo-note">
                  <span className="admin-login-demo-dot" aria-hidden="true" />
                  <span>
                    Non-admin shoppers and artisans cannot sign in here. Provision accounts via{' '}
                    <code>backend/scripts/create_admin_account.py</code>.
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        <p className="admin-login-page-footnote">
          HunarLink Heritage Craft Marketplace &middot; All admin authentication attempts are
          logged in <code>audit_logs</code>.
        </p>
      </main>
    </>
  );
}
