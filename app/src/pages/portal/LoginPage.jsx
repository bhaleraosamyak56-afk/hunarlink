import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../../state/StoreContext.jsx';
import {
  clearPendingClerkRole,
  useClerkBridge
} from '../../data/clerkConfig.js';
import {
  IconArrowRight,
  IconBadgeCheck,
  IconBookmark,
  IconCheck,
  IconShield,
  IconSpark,
  IconTruck,
  IconUser
} from '../../components/LineIcons.jsx';
import { hdSrcFor, srcSetFor } from '../../data/imageVariants.js';
import '../../styles/portal.css';

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

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, toast } = useStore();
  const clerk = useClerkBridge();

  const initialRole = params.get('role') === 'artisan' ? 'artisan' : 'user';
  const nextUrl = params.get('next') || '/';

  const [role, setRole] = useState(initialRole);
  const [errMsg, setErrMsg] = useState('');
  const [busyProvider, setBusyProvider] = useState(null);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailStep, setEmailStep] = useState('input'); // 'input' | 'verify'
  const [pendingFlow, setPendingFlow] = useState('signIn');
  const [emailBusy, setEmailBusy] = useState(false);

  const signedIn = clerk.enabled
    ? Boolean(clerk.isSignedIn)
    : Boolean(user && user.authProvider === 'clerk' && user.isLoggedIn);
  const isArtisanSession = Boolean(
    user && (user.role === 'seller' || user.role === 'artisan')
  );

  useEffect(() => {
    const resetBusy = (event) => {
      setBusyProvider(null);
      if (event?.persisted) clearPendingClerkRole();
    };
    const onVisChange = () => {
      if (document.visibilityState === 'visible') setBusyProvider(null);
    };
    window.addEventListener('pageshow', resetBusy);
    window.addEventListener('focus', resetBusy);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('pageshow', resetBusy);
      window.removeEventListener('focus', resetBusy);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, []);

  async function startOAuth(provider) {
    if (!clerk.enabled || !clerk.authenticateWithOAuth) {
      setErrMsg('Clerk authentication is required. Configure VITE_CLERK_PUBLISHABLE_KEY.');
      return;
    }
    setErrMsg('');
    setBusyProvider(provider);
    try {
      const res = await clerk.authenticateWithOAuth(provider, {
        role: role === 'artisan' ? 'artisan' : 'user',
        mode: 'signin',
        redirectTo: role === 'artisan' ? '/auth?tab=verify' : nextUrl || '/'
      });
      if (res?.alreadySignedIn && res?.destination) {
        navigate(res.destination, { replace: true });
      }
    } catch (err) {
      setBusyProvider(null);
      setErrMsg(err?.message || 'Could not start sign-in.');
    }
  }

  async function handleSendCode(e) {
    e.preventDefault();
    if (!clerk.sendEmailCode) {
      setErrMsg('Clerk email authentication is unavailable.');
      return;
    }
    setErrMsg('');
    setEmailBusy(true);
    try {
      const res = await clerk.sendEmailCode(email, role === 'artisan' ? 'artisan' : 'buyer');
      setPendingFlow(res.flow || 'signIn');
      setEmailStep('verify');
    } catch (err) {
      setErrMsg(err?.message || 'Could not send email code. Use Continue with Google.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    if (!clerk.verifyEmailCode) return;
    setErrMsg('');
    setEmailBusy(true);
    try {
      await clerk.verifyEmailCode(code, pendingFlow);
      navigate(role === 'artisan' ? '/auth?tab=verify' : nextUrl || '/', { replace: true });
    } catch (err) {
      setErrMsg(err?.message || 'Invalid or expired verification code.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function signOutHere() {
    if (clerk.signOutClerk) await clerk.signOutClerk();
    toast('Signed out cleanly');
  }

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
              <div className="up-brand-sub">
                {signedIn
                  ? isArtisanSession
                    ? 'Artisan Workspace'
                    : 'Verified Account'
                  : 'Secure Access'}
              </div>
            </div>
          </Link>
          <nav className="up-nav-links">
            {signedIn && (
              <Link to="/" className="up-nav-pill">
                <IconArrowRight size={13} className="login-back-arrow" /> Storefront
              </Link>
            )}
            {signedIn && (
              <Link to={isArtisanSession ? '/seller' : '/profile'} className="up-nav-pill">
                {isArtisanSession ? 'Workspace' : 'My Profile'}
              </Link>
            )}
            {signedIn ? (
              <button type="button" className="up-nav-pill" onClick={signOutHere}>
                Sign out
              </button>
            ) : (
              <Link to="/admin" className="login-header-hint login-admin-link">
                Admin Login
              </Link>
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
              loading="eager"
              decoding="async"
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
              <div className="login-pill" id="left-pill">
                <IconSpark size={11} />
                {role === 'artisan' ? 'Artisan Guild Access' : 'Verified Buyer Access'}
              </div>
              <h1 id="left-heading">
                {role === 'artisan'
                  ? 'Your craft, verified in the registry.'
                  : 'Sign in to enter HunarLink'}
              </h1>
              <p id="left-desc">
                {role === 'artisan'
                  ? 'Sign in with Clerk to complete GI / Artisan verification, manage real listings, and track orders directly from your workshop.'
                  : 'Every HunarLink marketplace listing, artisan dossier, and order is secured behind real verified identity.'}
              </p>
            </div>

            <ul className="login-perks">
              {role === 'artisan' ? (
                <>
                  <li><IconTruck size={14} /> Direct workshop listings stored in HunarLink MySQL / DB</li>
                  <li><IconBadgeCheck size={14} /> GI Registry &amp; Karigar verification workflow</li>
                  <li><IconShield size={14} /> Escrow-protected Razorpay payouts</li>
                </>
              ) : (
                <>
                  <li><IconTruck size={14} /> Live database-backed order tracking &amp; GI records</li>
                  <li><IconBookmark size={14} /> Saved addresses &amp; verified collector profile</li>
                  <li><IconShield size={14} /> Zero guest leakage — protected marketplace access</li>
                </>
              )}
            </ul>
          </div>

          <div className="login-right">
            {signedIn ? (
              <div style={{ padding: '1rem 0' }}>
                <div className="login-head">
                  <h2 className="login-title">You are signed in</h2>
                  <p className="login-sub">
                    Authenticated via Clerk as{' '}
                    <strong>{user?.name || user?.email || 'Verified Member'}</strong>
                    {user?.email ? ` (${user.email})` : ''}.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <button
                    type="button"
                    className="up-btn up-btn-primary up-btn-lg"
                    onClick={() => navigate(isArtisanSession ? '/seller' : nextUrl || '/')}
                  >
                    <IconArrowRight size={15} />
                    {isArtisanSession ? 'Open Artisan Workspace' : 'Enter HunarLink Marketplace'}
                  </button>
                  <button
                    type="button"
                    className="up-btn up-btn-outline"
                    onClick={signOutHere}
                  >
                    Sign out and switch account
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="login-head">
                  <h2 className="login-title" id="login-title">
                    {role === 'artisan' ? 'Artisan Sign In' : 'Sign in to HunarLink'}
                  </h2>
                  <p className="login-sub" id="login-sub">
                    {role === 'artisan'
                      ? 'Verify your identity to access GI onboarding & workshop listings.'
                      : 'Sign in with Google, Apple, or a verified email code to access the marketplace.'}
                  </p>
                </div>

                <div className="seg" role="group" aria-labelledby="role-label">
                  <span className="seg-label" id="role-label">Account</span>
                  <div className="seg-track">
                    <button
                      type="button"
                      className={`seg-btn${role === 'user' ? ' is-on' : ''}`}
                      id="role-user"
                      aria-pressed={role === 'user'}
                      onClick={() => {
                        setRole('user');
                        setErrMsg('');
                      }}
                    >
                      <IconUser size={14} />
                      Buyer
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${role === 'artisan' ? ' is-on' : ''}`}
                      id="role-artisan"
                      aria-pressed={role === 'artisan'}
                      onClick={() => {
                        setRole('artisan');
                        setErrMsg('');
                      }}
                    >
                      <IconSpark size={14} />
                      Artisan
                    </button>
                  </div>
                </div>

                {errMsg && (
                  <div className="login-error show" role="alert" style={{ marginBottom: '0.85rem' }}>
                    {errMsg}
                  </div>
                )}

                {clerk.enabled ? (
                  <div>
                    <div className="oauth-grid">
                      <button
                        type="button"
                        className="oauth-btn"
                        disabled={Boolean(busyProvider) || !clerk.isLoaded}
                        onClick={() => startOAuth('google')}
                      >
                        <GoogleGlyph />
                        <span>{busyProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}</span>
                      </button>
                      <button
                        type="button"
                        className="oauth-btn"
                        disabled={Boolean(busyProvider) || !clerk.isLoaded}
                        onClick={() => startOAuth('apple')}
                      >
                        <AppleGlyph />
                        <span>{busyProvider === 'apple' ? 'Redirecting…' : 'Continue with Apple'}</span>
                      </button>
                    </div>

                    <div className="oauth-divider" aria-hidden="true">
                      <span>or continue with email verification code</span>
                    </div>

                    {emailStep === 'input' ? (
                      <form onSubmit={handleSendCode}>
                        <div className="form-field">
                          <label className="up-label" htmlFor="clerk-email-input">
                            Email Address *
                          </label>
                          <input
                            id="clerk-email-input"
                            type="email"
                            className="up-input"
                            placeholder="name@example.com"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>
                        <button
                          type="submit"
                          className="up-btn up-btn-primary up-btn-lg"
                          style={{ width: '100%' }}
                          disabled={emailBusy}
                        >
                          <IconShield size={15} />
                          {emailBusy ? 'Sending email code…' : 'Send Email Verification Code'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyCode}>
                        <div className="form-field">
                          <label className="up-label" htmlFor="clerk-code-input">
                            6-Digit Code sent to {email} *
                          </label>
                          <input
                            id="clerk-code-input"
                            type="text"
                            inputMode="numeric"
                            className="up-input"
                            placeholder="Enter 6-digit code"
                            required
                            autoComplete="one-time-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                          />
                        </div>
                        <button
                          type="submit"
                          className="up-btn up-btn-primary up-btn-lg"
                          style={{ width: '100%' }}
                          disabled={emailBusy}
                        >
                          <IconCheck size={15} />
                          {emailBusy ? 'Verifying code…' : 'Verify & Enter HunarLink'}
                        </button>
                        <button
                          type="button"
                          className="up-btn up-btn-outline"
                          style={{ width: '100%', marginTop: '0.5rem' }}
                          onClick={() => {
                            setEmailStep('input');
                            setCode('');
                            setErrMsg('');
                          }}
                        >
                          Use a different email
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="login-error show" role="alert">
                    Clerk authentication is required. Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in{' '}
                    <code>app/.env.local</code> and restart Vite.
                  </div>
                )}

                {role === 'artisan' && (
                  <p className="login-footer-note" style={{ marginTop: '1rem' }}>
                    New Kashmiri artisan? Sign in above, then complete GI / Standard verification on{' '}
                    <Link to="/auth">Artisan Onboarding</Link>.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
