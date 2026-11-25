import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PortalScope from '../../components/PortalScope.jsx';
import { IconArrowRight, IconCheck, IconShield } from '../../components/LineIcons.jsx';
import { demoApi } from '../../data/adminDemo.js';
import { useStore } from '../../state/StoreContext.jsx';
import { srcSetFor } from '../../data/imageVariants.js';
import '../../styles/admin-login.css';

const DEMO_ADMIN = {
  identifier: 'admin@hunarlink.com',
  password: 'AdminPass@123'
};

export default function AdminLoginPage() {
  const { setAdminToken, toast } = useStore();
  const [identifier, setIdentifier] = useState(DEMO_ADMIN.identifier);
  const [password, setPassword] = useState(DEMO_ADMIN.password);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitLogin(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await demoApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });
      if (!result?.access_token) {
        setError('We could not verify those administrator credentials. Please try again.');
        return;
      }
      setAdminToken(result.access_token);
      toast('Administrative session authenticated.', 'success');
    } catch {
      setError('Admin sign-in is temporarily unavailable. Please try again.');
    } finally {
      setBusy(false);
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
              decoding="async"
            />
          </picture>
        </div>

        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <aside className="admin-login-rail">
            <div className="admin-login-rail-content">
              <span className="admin-login-rail-badge">
                <IconShield size={14} /> AUTHORIZED ACCESS
              </span>
              <h1>Protecting the craft, together.</h1>
              <p>
                Sign in to review artisan verification, monitor marketplace activity,
                and keep every craft traceable from the valley.
              </p>
            </div>

            <ul className="admin-login-privileges">
              <li><IconCheck size={14} /> GI verification reviews</li>
              <li><IconCheck size={14} /> Artisan and buyer oversight</li>
              <li><IconCheck size={14} /> Platform settings and audit trails</li>
            </ul>
          </aside>

          <div className="admin-login-form-panel">
            <div className="admin-login-form-heading">
              <p className="admin-login-eyebrow">HUNARLINK · ADMINISTRATOR</p>
              <h2 id="admin-login-title">Admin Login</h2>
              <p>Enter your administrator credentials to continue to the control center.</p>
            </div>

            {error && <div className="admin-login-error" role="alert">{error}</div>}

            <form id="admin-login-page-form" onSubmit={submitLogin}>
              <div className="admin-login-field">
                <label htmlFor="admin-login-identifier">Admin email or ID</label>
                <input
                  id="admin-login-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </div>

              <div className="admin-login-field">
                <label htmlFor="admin-login-password">Password or security key</label>
                <input
                  id="admin-login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              <button className="admin-login-submit" id="admin-login-submit" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Continue to Admin Console'}
                {!busy && <IconArrowRight size={15} />}
              </button>
            </form>

            <div className="admin-login-demo-note">
              <span className="admin-login-demo-dot" aria-hidden="true" />
              <span>Static preview · demo administrator session</span>
            </div>
          </div>
        </section>

        <p className="admin-login-page-footnote">HunarLink administrative access · Authorized staff only</p>
      </main>
    </>
  );
}
