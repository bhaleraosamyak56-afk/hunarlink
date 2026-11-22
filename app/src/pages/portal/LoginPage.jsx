import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../../styles/portal.css';
import PortalScope from '../../components/PortalScope.jsx';
import { useStore } from '../../state/StoreContext.jsx';

/* ==========================================================================
   LoginPage — collector (buyer) sign in / sign up
   --------------------------------------------------------------------------
   Behaviour ported from user-portal/login.html. All 7 handlers the static page
   wired are React state now:
     switchLoginMode      — the Login / Create Account tabs
     toggleOtpLoginMode   — the "login with OTP" checkbox
     generateDemoOtp      — the Send 6-Digit OTP button
     handleUserSignIn     — the sign-in form (password or OTP branch)
     handleUserSignUp     — the create-account form
     quickDemoUserLogin   — the 1-tap Priya demo
     (DOMContentLoaded)   — ?mode=signup opens the signup tab

   The session lives where it always did: hunarlink_buyer_profile with
   isLoggedIn, mirrored onto hunarlink_auth_user so the storefront header can
   read it. An artisan session is never overwritten from this page.
   ========================================================================== */

const PROFILE_KEY = 'hunarlink_buyer_profile';
const AUTH_KEY = 'hunarlink_auth_user';

const DEFAULT_PROFILE = {
  firstName: 'Priya',
  lastName: 'Sharma',
  fullName: 'Priya Sharma',
  email: 'priya.sharma@valleycollector.in',
  phone: '+91 98112 77420',
  gender: 'Female',
  dob: '1996-05-14',
  bio: 'Collector of GI-certified Kashmiri Pashmina, Kani shawls, and hand-carved walnut woodcraft.',
  preferredUpi: 'priya.sharma@okaxis',
  preferredPayment: 'UPI Verified Escrow',
  avatarColor: '#E05A17',
  avatarPhoto: '',
  badge: 'PS',
  role: 'buyer',
  isLoggedIn: false,
  memberSince: 'Nov 2026'
};

function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (saved) return { ...DEFAULT_PROFILE, ...saved };
  } catch (err) {
    /* storage unavailable — use defaults */
  }
  return { ...DEFAULT_PROFILE };
}

/* upSaveProfile(): derive fullName + badge from the name, force role buyer,
   and mirror the display identity onto the storefront session key. */
function writeProfile(patch) {
  const merged = { ...readProfile(), ...patch };
  const first = String(merged.firstName || 'Priya').trim();
  const last = String(merged.lastName || '').trim();
  const updated = {
    ...merged,
    firstName: first,
    lastName: last,
    fullName: (first + (last ? ' ' + last : '')).trim(),
    badge: ((first[0] || 'P') + (last[0] || first[1] || 'S')).toUpperCase(),
    role: 'buyer'
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    if (!auth || auth.role !== 'artisan') {
      localStorage.setItem(
        AUTH_KEY,
        JSON.stringify({
          name: updated.firstName,
          fullName: updated.fullName,
          email: updated.email,
          phone: updated.phone,
          role: 'buyer',
          title: 'Verified Valley Collector \u2022 J&K',
          badge: updated.badge,
          isLoggedIn: updated.isLoggedIn
        })
      );
    }
  } catch (err) {
    /* ignore quota / privacy-mode failures */
  }
  return updated;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser, toast } = useStore();

  const [mode, setMode] = useState(() => (params.get('mode') === 'signup' ? 'signup' : 'signin'));
  const [useOtp, setUseOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [signin, setSignin] = useState({ identifier: '', password: '', otp: '' });
  const [signup, setSignup] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: 'Female',
    password: ''
  });

  /* Keep the storefront header pill in step with whatever session is on disk. */
  useEffect(() => {
    const p = readProfile();
    setUser({
      name: p.firstName,
      fullName: p.fullName,
      email: p.email,
      role: 'buyer',
      title: 'Verified Valley Collector \u2022 J&K',
      badge: p.badge,
      isLoggedIn: p.isLoggedIn
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = params.get('redirect') || '/profile';

  function land(message, profile) {
    toast(message, 'success');
    setUser({
      name: profile.firstName,
      fullName: profile.fullName,
      email: profile.email,
      role: 'buyer',
      title: 'Verified Valley Collector \u2022 J&K',
      badge: profile.badge,
      isLoggedIn: true
    });
    window.setTimeout(() => navigate(target), 750);
  }

  function sendOtp() {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtpCode(code);
    setSignin((s) => ({ ...s, otp: code }));
    toast(`\u2709\ufe0f 6-digit OTP (${code}) generated & ready!`, 'success');
  }

  function submitSignin(e) {
    e.preventDefault();
    const identifier = signin.identifier.trim();

    if (!identifier) {
      toast('\u26a0\ufe0f Please enter your email address or mobile number.');
      return;
    }

    if (useOtp) {
      if (!otpCode || signin.otp.trim() !== otpCode) {
        toast("\u26a0\ufe0f Please click 'Send 6-Digit OTP' and enter the matching 6-digit code.");
        return;
      }
    } else if (!signin.password) {
      toast('\u26a0\ufe0f Please enter your password.');
      return;
    }

    const existing = readProfile();
    const isEmail = identifier.includes('@');
    const nameFromEmail = isEmail
      ? identifier
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : existing.fullName;
    const parts = nameFromEmail.split(' ');

    /* The static build only adopted the typed name when the identifier
       differed, so re-signing in as the saved collector keeps their details. */
    const samePerson = String(existing.email || '').toLowerCase() === identifier.toLowerCase();

    const profile = writeProfile({
      firstName: samePerson ? existing.firstName : parts[0] || existing.firstName,
      lastName: samePerson ? existing.lastName : parts.slice(1).join(' ') || existing.lastName,
      email: isEmail ? identifier : existing.email,
      phone: !isEmail ? identifier : existing.phone,
      isLoggedIn: true
    });

    land(`\u2713 Welcome back, ${profile.fullName}! Opening your account...`, profile);
  }

  function submitSignup(e) {
    e.preventDefault();
    const first = signup.firstName.trim();
    const last = signup.lastName.trim();
    if (!first || !last || !signup.email.trim() || !signup.phone.trim()) {
      toast('\u26a0\ufe0f Please complete every required field.');
      return;
    }
    const profile = writeProfile({
      firstName: first,
      lastName: last,
      email: signup.email.trim(),
      phone: signup.phone.trim(),
      gender: signup.gender,
      isLoggedIn: true
    });
    land(`\u2726 Account created for ${profile.fullName}! Redirecting to Profile...`, profile);
  }

  function demoLogin() {
    const profile = writeProfile({ ...DEFAULT_PROFILE, isLoggedIn: true });
    land(`\u26a1 Signed in as ${profile.fullName}!`, profile);
  }

  const isSignin = mode === 'signin';

  return (
    <>
      <PortalScope family="user" />
      {/* Shared Top Header */}
      <header className="up-header">
        <div className="up-header-inner">
          <a href={'/'} className="up-brand">
            <span className="up-emblem">H</span>
            <div>
              <div className="up-brand-title">HunarLink</div>
              <div className="up-brand-sub">User Account Portal</div>
            </div>
          </a>
          <nav className="up-nav-links">
            <a href={'/'} className="up-nav-pill">🏠 Storefront</a>
            <a href={'/profile'} className="up-nav-pill">👤 My Profile</a>
            <a href={'/orders'} className="up-nav-pill">📦 Track Orders</a>
            <a href={'/login'} className="up-nav-pill active" id="nav-auth-pill">🔐 User Login</a>
          </nav>
        </div>
      </header>

      {/* Dedicated User Login / Sign Up Split Card */}
      <main className="login-shell">
        <section className="login-card">
          <div className="login-left">
            <div>
              <div
                style={{display: 'inline-block', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FFB46B', border: '1px solid rgba(255,180,107,0.4)', borderRadius: '999px', padding: '4px 12px', marginBottom: '16px'}}>
                ✦ HUNARLINK COLLECTOR ACCOUNT
              </div>
              <h1 id="left-heading">
                {isSignin ? 'Welcome to HunarLink' : 'Create Your HunarLink Account'}
              </h1>
              <p id="left-desc">
                {isSignin
                  ? 'Sign in to customize your personal profile, manage saved delivery addresses, track your GI-certified Kashmiri handicraft orders live, and protect every purchase with HunarLink Escrow.'
                  : 'Join HunarLink to follow every loom hour, verify GI provenance at your doorstep, and keep your acquisition history in one collector archive.'}
              </p>
            </div>

            <div className="login-perks">
              <div className="login-perk-item"><span>📦</span> Live 5-stage order tracking &amp; GI invoices</div>
              <div className="login-perk-item"><span>👤</span> Full Flipkart-style profile &amp; address manager</div>
              <div className="login-perk-item"><span>🛡️</span> 100% GI-verified crafts with doorstep QR check</div>
            </div>
          </div>

          <div className="login-right">
            {/* Switch Between Login & Sign Up */}
            <div className="login-tabs" role="tablist">
              <button
                type="button"
                className={`login-tab-btn${isSignin ? ' active' : ''}`}
                id="tab-signin"
                role="tab"
                aria-selected={isSignin}
                onClick={() => setMode('signin')}
              >
                🔐 User Login
              </button>
              <button
                type="button"
                className={`login-tab-btn${isSignin ? '' : ' active'}`}
                id="tab-signup"
                role="tab"
                aria-selected={!isSignin}
                onClick={() => setMode('signup')}
              >
                ✨ Create Account
              </button>
            </div>

            {/* FORM 1: USER SIGN IN (PASSWORD OR 6-DIGIT OTP) */}
            <form
              id="user-signin-form"
              onSubmit={submitSignin}
              style={{display: isSignin ? 'block' : 'none'}}
            >
              <div className="form-field">
                <label className="up-label" htmlFor="signin-identifier">Email Address or Mobile Number *</label>
                <input
                  type="text"
                  id="signin-identifier"
                  className="up-input"
                  placeholder="e.g. priya.sharma@valleycollector.in or +91 98112 77420"
                  required
                  value={signin.identifier}
                  onChange={(e) => setSignin({ ...signin, identifier: e.target.value })}
                />
              </div>

              <div
                className="form-field"
                id="password-field-wrap"
                style={{display: useOtp ? 'none' : 'block'}}
              >
                <label className="up-label" htmlFor="signin-password">Password *</label>
                <input
                  type="password"
                  id="signin-password"
                  className="up-input"
                  placeholder="Enter your password"
                  required={!useOtp}
                  value={signin.password}
                  onChange={(e) => setSignin({ ...signin, password: e.target.value })}
                />
              </div>

              {/* Optional 6-Digit OTP Mode */}
              <div id="otp-field-wrap" style={{display: useOtp ? 'block' : 'none'}}>
                <div className="otp-helper-box">
                  <span id="otp-status-text">
                    {otpCode ? (
                      <>Your 6-digit HunarLink OTP is <strong style={{letterSpacing: '0.12em'}}>{otpCode}</strong> (valid 10 min)</>
                    ) : (
                      'Generate a 6-digit one-time login code for instant verification.'
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn-orange-outline"
                    style={{padding: '5px 11px', fontSize: '0.74rem'}}
                    onClick={sendOtp}
                  >
                    Send 6-Digit OTP
                  </button>
                </div>
                <div className="form-field">
                  <label className="up-label" htmlFor="signin-otp">Enter 6-Digit OTP *</label>
                  <input
                    type="text"
                    id="signin-otp"
                    className="up-input"
                    maxLength="6"
                    placeholder="e.g. 482910"
                    required={useOtp}
                    value={signin.otp}
                    onChange={(e) => setSignin({ ...signin, otp: e.target.value })}
                  />
                </div>
              </div>

              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '8px', flexWrap: 'wrap'}}>
                <label style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-700)', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    id="toggle-otp-mode"
                    style={{accentColor: 'var(--btn-orange)'}}
                    checked={useOtp}
                    onChange={(e) => setUseOtp(e.target.checked)}
                  />
                  <span>Login with 6-Digit OTP instead</span>
                </label>
                <button type="button" className="btn-link-edit" onClick={demoLogin}>⚡ 1-Tap Demo Login (Priya)</button>
              </div>

              <button type="submit" className="btn-orange" style={{width: '100%', height: '46px'}}>
                Sign In to My Account →
              </button>
            </form>

            {/* FORM 2: CREATE NEW USER ACCOUNT */}
            <form
              id="user-signup-form"
              onSubmit={submitSignup}
              style={{display: isSignin ? 'none' : 'block'}}
            >
              <div className="form-row-2">
                <div className="form-field">
                  <label className="up-label" htmlFor="su-first">First Name *</label>
                  <input
                    type="text" id="su-first" className="up-input" placeholder="e.g. Priya" required
                    value={signup.firstName}
                    onChange={(e) => setSignup({ ...signup, firstName: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label className="up-label" htmlFor="su-last">Last Name *</label>
                  <input
                    type="text" id="su-last" className="up-input" placeholder="e.g. Sharma" required
                    value={signup.lastName}
                    onChange={(e) => setSignup({ ...signup, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label className="up-label" htmlFor="su-email">Email Address *</label>
                  <input
                    type="email" id="su-email" className="up-input" placeholder="you@example.com" required
                    value={signup.email}
                    onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label className="up-label" htmlFor="su-phone">Mobile Number *</label>
                  <input
                    type="tel" id="su-phone" className="up-input" placeholder="+91 98112 77420" required
                    value={signup.phone}
                    onChange={(e) => setSignup({ ...signup, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label className="up-label" htmlFor="su-gender">Gender</label>
                  <select
                    id="su-gender" className="up-select"
                    value={signup.gender}
                    onChange={(e) => setSignup({ ...signup, gender: e.target.value })}
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="up-label" htmlFor="su-password">Create Password *</label>
                  <input
                    type="password" id="su-password" className="up-input"
                    placeholder="Min. 6 characters" minLength="6" required
                    value={signup.password}
                    onChange={(e) => setSignup({ ...signup, password: e.target.value })}
                  />
                </div>
              </div>

              <button type="submit" className="btn-orange" style={{width: '100%', height: '46px', marginTop: '4px'}}>
                Create User Account &amp; Open Profile →
              </button>
            </form>

            <div
              style={{marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem', color: 'var(--text-500)'}}>
              <span>Are you a Kashmiri Artisan / Seller?</span>
              <a href={'/auth?mode=login&role=artisan'}
                style={{color: 'var(--btn-orange)', fontWeight: '700', textDecoration: 'none'}}>Open Seller Portal Login →</a>
            </div>
          </div>
        </section>
      </main>

      <div className="up-toast" id="up-toast"></div>
    </>
  );
}
