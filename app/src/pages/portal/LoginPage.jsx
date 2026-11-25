import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import '../../styles/portal.css';
import PortalScope from '../../components/PortalScope.jsx';
import {
  IconUser,
  IconSpark,
  IconBadgeCheck,
  IconTruck,
  IconShield,
  IconBookmark,
  IconArrowRight
} from '../../components/LineIcons.jsx';
import { useStore } from '../../state/StoreContext.jsx';
import { IS_CLERK_DEV_KEY, useClerkBridge } from '../../data/clerkConfig.js';
import { srcSetFor, hdSrcFor } from '../../data/imageVariants.js';

/* ==========================================================================
   LoginPage — collector (user) & artisan sign in / collector sign up
   --------------------------------------------------------------------------
   Handles both User and Artisan sign-in via the segmented role switcher
   (`?role=artisan` for makers). Artisan registration routes to the dedicated
   `/auth?mode=register&role=artisan` flow with GI & live-camera verification.
   ========================================================================== */

const AUTH_KEY = 'hunarlink_auth_user';

/* Seed accounts so an artisan can sign in with email, phone, or Artisan Card
   Number on a fresh browser (or via demo / social login). */
const SEED_ARTISANS = [
  {
    email: 'ghulam.mir@zadibalpashmina.com',
    phone: '+91 94190 88210',
    password: 'SozniLoom100%',
    role: 'artisan',
    name: 'Master Ghulam Qadir Mir',
    business: 'Mir Heritage Loom Guild',
    craft: 'Pashmina',
    district: 'Srinagar',
    cardNo: 'HL-ART-88210',
    caseId: 'GI-JK-PASH-8821',
    trust: 'Guild-Verified \u2022 Pashmina & Kani Weavers Guild',
    badge: 'GM'
  },
  {
    email: 'fayaz.wani@anantnagcrafts.org',
    phone: '+91 94190 55218',
    password: 'WalnutArtisan#1',
    role: 'artisan',
    name: 'Fayaz Ahmad Wani',
    business: 'Wani Woodcraft Atelier',
    craft: 'Walnut wood',
    district: 'Anantnag',
    cardNo: 'HL-ART-11800',
    caseId: 'GI-JK-WNT-1180',
    trust: 'Guild-Verified \u2022 Walnut Wood Carving Cooperative',
    badge: 'FA'
  }
];

const DEFAULT_PROFILE = {
  firstName: 'Priya',
  lastName: 'Sharma',
  fullName: 'Priya Sharma',
  email: 'priya.sharma@valleycollector.in',
  phone: '+91 98112 77420',
  gender: 'Female',
  dob: '1996-05-14',
  bio: 'Buyer of GI-certified Kashmiri Pashmina, Kani shawls, and hand-carved walnut woodcraft.',
  preferredUpi: 'priya.sharma@okaxis',
  preferredPayment: 'UPI Verified Escrow',
  avatarColor: '#E05A17',
  avatarPhoto: '',
  badge: 'PS',
  role: 'buyer',
  isLoggedIn: false,
  memberSince: 'Nov 2026'
};

function readProfile(savedProfile) {
  return savedProfile ? { ...DEFAULT_PROFILE, ...savedProfile } : { ...DEFAULT_PROFILE };
}

function buildProfile(savedProfile, patch) {
  const merged = { ...readProfile(savedProfile), ...patch };
  const first = String(merged.firstName || 'Priya').trim();
  const last = String(merged.lastName || '').trim();
  return {
    ...merged,
    firstName: first,
    lastName: last,
    fullName: (first + (last ? ' ' + last : '')).trim(),
    badge: ((first[0] || 'P') + (last[0] || first[1] || 'S')).toUpperCase(),
    role: 'buyer'
  };
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1a7 7 0 0 1-6.6-4.8H1.4v3.1A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z"
    />
    <path
      fill="#EA4335"
      d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1A7 7 0 0 1 12 4.8z"
    />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
    <path d="M16.4 12.9c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9s-1.9-.9-3.1-.8c-1.6 0-3 .9-3.9 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3.1-.7s1.9.7 3.1.7 2.1-1.1 2.9-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.7zM14 5.4c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" />
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const navTimer = useRef(null);
  const clerk = useClerkBridge();
  const [oauthBusy, setOauthBusy] = useState(null);
  const {
    setUser,
    user: storeUser,
    buyerProfile,
    setBuyerProfile,
    toast,
    platformUsers
  } = useStore();

  useEffect(() => {
    return () => {
      if (navTimer.current) window.clearTimeout(navTimer.current);
    };
  }, []);

  const scheduleNavigate = (dest, delay = 750) => {
    if (navTimer.current) window.clearTimeout(navTimer.current);
    navTimer.current = window.setTimeout(() => navigate(dest), delay);
  };

  /* Persist a buyer profile through the store — one write path that also
     mirrors the identity onto the storefront session key. */
  const writeProfile = (patch) => {
    const updated = buildProfile(buyerProfile, patch);
    setBuyerProfile(updated);
    if (!storeUser || storeUser.role !== 'artisan') {
      setUser({
        name: updated.firstName,
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone,
        role: 'buyer',
        title: 'Verified Valley Buyer \u2022 J&K',
        badge: updated.badge,
        isLoggedIn: updated.isLoggedIn
      }, { silent: true });
    }
    return updated;
  };

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

  const role = params.get('role') === 'artisan' ? 'artisan' : 'user';
  const target = params.get('redirect') || '/profile';
  const isSignin = mode === 'signin';

  /* Keep mode in step with ?mode= when navigating via browser Back/Forward. */
  useEffect(() => {
    const urlMode = params.get('mode') === 'signup' ? 'signup' : 'signin';
    setMode(urlMode);
  }, [params]);

  /* Keep legacy deep links to artisan signup routing through the dedicated
     GI / standard seller registration experience. */
  useEffect(() => {
    if (role === 'artisan' && mode === 'signup') {
      navigate('/auth?mode=register&role=artisan', { replace: true });
    }
  }, [mode, navigate, role]);

  /* Sync storefront session from saved buyerProfile only when a persisted
     buyerProfile exists — never clobber an active buyer or artisan session. */
  useEffect(() => {
    if (!buyerProfile) return;
    if (storeUser && storeUser.role === 'artisan' && storeUser.isLoggedIn) return;
    const p = readProfile(buyerProfile);
    setUser({
      name: p.firstName,
      fullName: p.fullName,
      email: p.email,
      role: 'buyer',
      title: 'Verified Valley Buyer \u2022 J&K',
      badge: p.badge,
      isLoggedIn: p.isLoggedIn
    }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function land(message, profile) {
    toast(message, 'success');
    setUser({
      name: profile.firstName,
      fullName: profile.fullName,
      email: profile.email,
      role: 'buyer',
      title: 'Verified Valley Buyer \u2022 J&K',
      badge: profile.badge,
      isLoggedIn: true
    }, { silent: true });
    scheduleNavigate(target, 750);
  }

  function landArtisan(artisan, message) {
    setUser({
      name: (artisan.name || '').split(' ')[0] || 'Artisan',
      fullName: artisan.name,
      email: artisan.email,
      phone: artisan.phone,
      role: 'artisan',
      title: artisan.trust || 'Verified Artisan \u2022 J&K',
      badge: artisan.badge || 'AR',
      isLoggedIn: true,
      ...(artisan.socialProvider ? { socialProvider: artisan.socialProvider } : {})
    }, { silent: true });
    toast(message, 'success');
    scheduleNavigate('/seller', 750);
  }

  function sendOtp() {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtpCode(code);
    setSignin((s) => ({ ...s, otp: code }));
    toast(`6-digit OTP (${code}) generated & ready!`, 'success');
  }

  function submitSignin(e) {
    e.preventDefault();
    const identifier = signin.identifier.trim();

    if (!identifier) {
      toast('Please enter your email address or mobile number.');
      return;
    }

    if (useOtp) {
      if (!otpCode || signin.otp.trim() !== otpCode) {
        toast("Please click 'Send 6-Digit OTP' and enter the matching 6-digit code.");
        return;
      }
    } else if (!signin.password) {
      toast('Please enter your password.');
      return;
    }

    const existing = readProfile(buyerProfile);
    const isEmail = identifier.includes('@');
    const local = isEmail ? identifier.split('@')[0].replace(/[._-]+/g, ' ') : '';
    const pretty = local.replace(/\b\w/g, (c) => c.toUpperCase());
    const parts = pretty ? pretty.split(' ') : ['Demo', 'Collector'];
    const samePerson = String(existing.email || '').toLowerCase() === identifier.toLowerCase();

    const profile = writeProfile({
      firstName: samePerson ? existing.firstName : parts[0] || existing.firstName,
      lastName: samePerson ? existing.lastName : parts.slice(1).join(' ') || existing.lastName,
      email: isEmail ? identifier : `demo-${Date.now()}@hunarlink.local`,
      phone: !isEmail ? identifier : existing.phone,
      isLoggedIn: true
    });

    land(`Welcome back, ${profile.fullName}! Opening your account...`, profile);
  }

  function submitSignup(e) {
    e.preventDefault();
    const first = signup.firstName.trim();
    const last = signup.lastName.trim();
    if (!first || !last || !signup.email.trim() || !signup.phone.trim()) {
      toast('Please complete every required field.');
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
    land(`Account created for ${profile.fullName}! Redirecting to Profile...`, profile);
  }

  const digits = (v) => String(v || '').replace(/\D/g, '');

  function artisanAccounts() {
    const stored = platformUsers || [];
    const seen = new Set(stored.map((a) => String(a.email || '').toLowerCase()));
    return [...stored, ...SEED_ARTISANS.filter((a) => !seen.has(a.email.toLowerCase()))];
  }

  function findArtisan(identifier) {
    const raw = String(identifier || '').trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const asDigits = digits(raw);

    return (
      artisanAccounts().find((a) => {
        if (a.role && a.role !== 'artisan') return false;
        const email = String(a.email || '').toLowerCase();
        const card = String(a.cardNo || '').toLowerCase();
        if (email && email === lower) return true;
        if (card && card === lower) return true;
        if (card && digits(card) && digits(card) === asDigits) return true;
        const phone = digits(a.phone);
        if (phone && asDigits.length >= 10 && phone.slice(-10) === asDigits.slice(-10)) return true;
        return false;
      }) || null
    );
  }

  function submitArtisanSignin(e) {
    e.preventDefault();
    const identifier = signin.identifier.trim();

    if (!identifier) {
      toast('Enter your email, mobile number or Artisan Card Number.');
      return;
    }
    if (!signin.password) {
      toast('A password is required to sign in as an artisan.');
      return;
    }

    const match = findArtisan(identifier);
    if (!match) {
      toast('No artisan account matches that email, number or card. Create an account below.');
      return;
    }
    if (match.password && match.password !== signin.password) {
      toast('That password does not match this account.');
      return;
    }
    landArtisan(match, `Welcome back, ${match.name}! Opening your workspace...`);
  }

  function switchRole(next) {
    setUseOtp(false);
    setSignin({ identifier: '', password: '', otp: '' });
    const nextParams = new URLSearchParams(params);
    if (next === 'artisan') nextParams.set('role', 'artisan');
    else nextParams.delete('role');
    setParams(nextParams, { replace: true });
  }

  function switchMode(next) {
    if (next === 'signup' && role === 'artisan') {
      navigate('/auth?mode=register&role=artisan');
      return;
    }
    setMode(next);
    const nextParams = new URLSearchParams(params);
    if (next === 'signup') nextParams.set('mode', 'signup');
    else nextParams.delete('mode');
    setParams(nextParams, { replace: true });
  }

  function demoLogin() {
    if (role === 'artisan') {
      const demo = SEED_ARTISANS[0];
      landArtisan(demo, `Signed in as ${demo.name}! Opening your workspace...`);
      return;
    }
    const profile = writeProfile({ ...DEFAULT_PROFILE, isLoggedIn: true });
    land(`Signed in as ${profile.fullName}!`, profile);
  }

  async function socialLogin(provider) {
    if (clerk.enabled && clerk.authenticateWithOAuth) {
      setOauthBusy(provider);
      try {
        const res = await clerk.authenticateWithOAuth(provider, {
          role,
          mode,
          redirectTo: target
        });
        if (res && res.alreadySignedIn) {
          toast(`Signed in with Clerk! Opening your ${role === 'artisan' ? 'workspace' : 'account'}...`, 'success');
          scheduleNavigate(res.destination, 400);
        }
      } catch (err) {
        toast(err?.message || `Could not continue with ${provider}.`, 'error');
        setOauthBusy(null);
      }
      return;
    }

    if (role === 'artisan') {
      const demo = { ...SEED_ARTISANS[0], socialProvider: provider };
      landArtisan(
        demo,
        `Signed in with ${provider} as ${demo.name}! Opening your workspace...`
      );
      return;
    }
    const profile = writeProfile({
      ...DEFAULT_PROFILE,
      isLoggedIn: true,
      authProvider: provider
    });
    const verb = isSignin ? 'Signed in' : 'Account created';
    land(`${verb} with ${provider} as ${profile.fullName}!`, profile);
  }

  const signedIn = Boolean(
    (storeUser && storeUser.isLoggedIn) || (buyerProfile && buyerProfile.isLoggedIn)
  );

  const liveRole = (() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(AUTH_KEY) || 'null');
      if (raw && raw.role) return raw.role;
    } catch {
      /* fall through to the store copy */
    }
    return storeUser?.role || (role === 'artisan' ? 'artisan' : 'buyer');
  })();
  const isArtisanSession = liveRole === 'artisan';

  async function signOutHere() {
    try {
      window.localStorage.removeItem(AUTH_KEY);
    } catch {
      /* storage may be unavailable in private mode; the store is the source */
    }
    if (clerk.enabled && clerk.signOutClerk) {
      try {
        await clerk.signOutClerk();
      } catch {
        /* fall through to local sign-out */
      }
    }
    setUser(null, { silent: true });
    setBuyerProfile(buildProfile(buyerProfile, { isLoggedIn: false }));
    toast('Signed out.');
  }

  return (
    <>
      <PortalScope family="user" />
      <header className="up-header login-header">
        <div className="up-header-inner">
          <Link to="/" className="up-brand">
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
                  ? isArtisanSession ? 'Artisan Workspace' : 'User Account'
                  : 'My Account'}
              </div>
            </div>
          </Link>
          <nav className="up-nav-links">
            <Link to="/" className="up-nav-pill">
              <IconArrowRight size={13} className="login-back-arrow" /> Storefront
            </Link>
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
                {role === 'artisan' ? 'Artisan account' : 'User account'}
              </div>
              <h1 id="left-heading">
                {role === 'artisan'
                  ? 'Your craft, your storefront.'
                  : (isSignin ? 'Welcome to HunarLink' : 'Create Your HunarLink Account')}
              </h1>
              <p id="left-desc">
                {role === 'artisan'
                  ? 'Sign in to manage your listings, answer buyer questions and publish new work straight to the storefront.'
                  : (isSignin
                      ? 'Track every order from the loom, keep your addresses on file, and buy under HunarLink Escrow.'
                      : 'Follow each piece from the maker\u2019s hands to your door, with its provenance on record.')}
              </p>
            </div>

            <ul className="login-perks">
              {role === 'artisan' ? (
                <>
                  <li><IconTruck size={14} /> Publish listings and track every order in one workspace</li>
                  <li><IconBadgeCheck size={14} /> Guild and GI credentials carried on your storefront</li>
                  <li><IconShield size={14} /> Buyer payments held in escrow until you ship</li>
                </>
              ) : (
                <>
                  <li><IconTruck size={14} /> Five-stage order tracking with GI invoices</li>
                  <li><IconBookmark size={14} /> Saved addresses and a collector wishlist</li>
                  <li><IconShield size={14} /> GI-verified crafts, checked at your door</li>
                </>
              )}
            </ul>
          </div>

          <div className="login-right">
            <div className="login-head">
              <h2 className="login-title" id="login-title">
                {isSignin ? 'Sign in to your account' : 'Create your account'}
              </h2>
              <p className="login-sub" id="login-sub">
                {isSignin
                  ? role === 'artisan'
                    ? 'Manage your listings, buyer questions and payouts.'
                    : 'Track orders, save favourites and follow the makers you collect.'
                  : 'It takes a minute, and your addresses carry over to checkout.'}
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
                  onClick={() => switchRole('user')}
                >
                  <IconUser size={14} />
                  User
                </button>
                <button
                  type="button"
                  className={`seg-btn${role === 'artisan' ? ' is-on' : ''}`}
                  id="role-artisan"
                  aria-pressed={role === 'artisan'}
                  onClick={() => switchRole('artisan')}
                >
                  <IconSpark size={14} />
                  Artisan
                </button>
              </div>
            </div>

            {/* SIGN IN FORM (USER OR ARTISAN) */}
            {isSignin ? (
              <form
                id={role === 'artisan' ? 'artisan-signin-form' : 'user-signin-form'}
                onSubmit={role === 'artisan' ? submitArtisanSignin : submitSignin}
              >
                  <div className="form-field">
                    <label className="up-label" htmlFor="signin-identifier">
                      {role === 'artisan'
                        ? 'Email, Mobile Number or Artisan Card Number *'
                        : 'Email Address or Mobile Number *'}
                    </label>
                    <input
                      type="text"
                      id="signin-identifier"
                      className="up-input"
                      placeholder={role === 'artisan'
                        ? 'e.g. HL-ART-88210, or your email, or +91 94190 88210'
                        : 'e.g. priya.sharma@valleycollector.in or +91 98112 77420'}
                      required
                      value={signin.identifier}
                      onChange={(e) => setSignin({ ...signin, identifier: e.target.value })}
                    />
                    {role === 'artisan' && (
                      <p className="field-hint">
                        Your Artisan Card Number is the code on your craft identity card.
                      </p>
                    )}
                  </div>

                  <div
                    className="form-field"
                    id="password-field-wrap"
                    style={{ display: useOtp ? 'none' : 'block' }}
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

                  {/* Optional 6-Digit OTP Mode (Collector only) */}
                  {role === 'user' && useOtp && (
                    <div id="otp-field-wrap">
                      <div className="otp-helper-box">
                        <span id="otp-status-text">
                          {otpCode ? (
                            <>Your 6-digit HunarLink OTP is <strong style={{ letterSpacing: '0.12em' }}>{otpCode}</strong> (valid 10 min)</>
                          ) : (
                            'Generate a 6-digit one-time login code for instant verification.'
                          )}
                        </span>
                        <button
                          type="button"
                          className="btn-orange-outline"
                          style={{ padding: '5px 11px', fontSize: '0.74rem' }}
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
                          required
                          value={signin.otp}
                          onChange={(e) => setSignin({ ...signin, otp: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="login-row-help">
                    {role === 'artisan' ? (
                      <span className="login-row-note">Password required for artisan accounts</span>
                    ) : (
                      <label className="login-check">
                        <input
                          type="checkbox"
                          id="toggle-otp-mode"
                          checked={useOtp}
                          onChange={(e) => setUseOtp(e.target.checked)}
                        />
                        <span>Login with 6-Digit OTP instead</span>
                      </label>
                    )}
                    <button type="button" className="btn-link-edit" onClick={demoLogin}>
                      Use demo account
                    </button>
                  </div>

                <button type="submit" className="btn-orange" style={{ width: '100%', height: '46px' }}>
                  <span>Sign in</span>
                  <IconArrowRight size={15} />
                </button>
              </form>
            ) : (
              /* CREATE USER ACCOUNT FORM */
              <form id="user-signup-form" onSubmit={submitSignup}>
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

                <button type="submit" className="btn-orange" style={{ width: '100%', height: '46px', marginTop: '4px' }}>
                  <span>Create account</span>
                  <IconArrowRight size={15} />
                </button>
              </form>
            )}

            {/* Social Sign-In / Sign-Up Options (User & Artisan) */}
            <div className="login-social-section">
              <div className="login-social-divider">
                <span>or continue with</span>
              </div>
              <div className="login-social-stack">
                <button
                  type="button"
                  className="login-social-btn"
                  disabled={Boolean(oauthBusy)}
                  onClick={() => socialLogin('Google')}
                >
                  <GoogleIcon />
                  <span>
                    {oauthBusy === 'Google' ? 'Connecting to Google\u2026' : 'Continue with Google'}
                  </span>
                </button>
                <button
                  type="button"
                  className="login-social-btn"
                  disabled={Boolean(oauthBusy)}
                  onClick={() => socialLogin('Apple')}
                >
                  <AppleIcon />
                  <span>
                    {oauthBusy === 'Apple' ? 'Connecting to Apple\u2026' : 'Continue with Apple'}
                  </span>
                </button>
              </div>
              {clerk.enabled && (
                <p className="login-social-note">
                  {IS_CLERK_DEV_KEY
                    ? 'Clerk dev OAuth active \u2014 use the same browser signed into dashboard.clerk.com.'
                    : 'Secured with Clerk OAuth.'}
                </p>
              )}
              <div id="clerk-captcha" />
            </div>

            <div className="login-swap">
              <span>
                {isSignin ? 'Don\u2019t have an account?' : 'Already have an account?'}
              </span>
              <button
                type="button"
                className="login-swap-link"
                onClick={() => switchMode(isSignin ? 'signup' : 'signin')}
              >
                {isSignin ? 'Create account' : 'Sign in'}
                <IconArrowRight size={13} />
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
