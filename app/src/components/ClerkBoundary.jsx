import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ClerkProvider,
  useAuth,
  useClerk,
  useUser
} from '@clerk/react';
import { useSignIn, useSignUp } from '@clerk/react/legacy';
import { useStore } from '../state/StoreContext.jsx';
import { canAttemptBackend, checkAuthAccount, syncAuthenticatedUser } from '../services/apiClient.js';
import {
  CLERK_PUBLISHABLE_KEY,
  CLERK_ROLE_MAP_KEY,
  ClerkBridgeContext,
  clearPendingClerkAuthMode,
  clearPendingClerkNext,
  clearPendingClerkRole,
  readClerkArtisanProfile,
  readPendingClerkAuthMode,
  readPendingClerkNext,
  readPendingClerkRole,
  saveClerkArtisanProfile,
  setPendingClerkAuthMode,
  setPendingClerkNext,
  setPendingClerkRole
} from '../data/clerkConfig.js';

/* ==========================================================================
   ClerkBoundary — the single file in the app that imports @clerk/react
   --------------------------------------------------------------------------
   Lazy-loaded by main.jsx only when HAS_CLERK is true (e.g. localhost with
   VITE_CLERK_PUBLISHABLE_KEY in app/.env.local). Keeps StoreContext in step
   with the Clerk session and powers Google / Apple OAuth on /login and /auth.
   ========================================================================== */

function readRoleMap() {
  try {
    const raw = window.localStorage.getItem(CLERK_ROLE_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUserRole(clerkUserId, role) {
  if (!clerkUserId || !role) return;
  try {
    const map = readRoleMap();
    map[clerkUserId] = role;
    window.localStorage.setItem(CLERK_ROLE_MAP_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

function initialsOf(first, last, email) {
  const a = (first || email || 'H')[0] || 'H';
  const b = (last || (first && first[1]) || 'L')[0] || 'L';
  return (a + b).toUpperCase();
}

function formatClerkError(err, provider) {
  const first = err?.errors?.[0];
  const code = first?.code || '';
  const msg = first?.longMessage || first?.message || err?.message || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'this origin';
  if (code === 'dev_browser_unauthenticated') {
    return `Clerk dev mode requires using the same browser where you are signed into dashboard.clerk.com on ${origin}.`;
  }
  if (/not enabled|unsupported|strategy/i.test(msg)) {
    return `${provider} sign-in is not enabled yet in your Clerk Dashboard (User & Authentication -> SSO Connections).`;
  }
  return msg || `Could not start ${provider} sign-in with Clerk.`;
}

function buildSyncedUser(clerkUser, resolvedRole) {
  const email = clerkUser.primaryEmailAddress?.emailAddress || '';
  const phone = clerkUser.primaryPhoneNumber?.phoneNumber || '';
  const first =
    clerkUser.firstName ||
    (clerkUser.fullName ? clerkUser.fullName.split(' ')[0] : '') ||
    (email ? email.split('@')[0] : 'Collector');
  const last =
    clerkUser.lastName ||
    (clerkUser.fullName ? clerkUser.fullName.split(' ').slice(1).join(' ') : '');
  const fullName = clerkUser.fullName || `${first} ${last}`.trim();
  const badge = initialsOf(first, last, email);

  if (resolvedRole === 'artisan') {
    const saved = readClerkArtisanProfile(clerkUser.id);
    const artisanVerified = Boolean(saved?.artisanVerified);
    return {
      first,
      last,
      fullName,
      email,
      phone: saved?.phone || phone,
      badge,
      artisanVerified,
      payload: {
        name: saved?.name || fullName || first,
        fullName: saved?.name || fullName,
        email: saved?.email || email,
        phone: saved?.phone || phone,
        role: 'artisan',
        artisanVerified,
        business: saved?.business || '',
        craft: saved?.craft || '',
        district: saved?.district || '',
        cluster: saved?.district || '',
        giCertified: Boolean(saved?.giCertified),
        giId: saved?.giId || null,
        skillDescription: saved?.skillDescription || '',
        title: artisanVerified
          ? saved?.title || 'Verified Artisan \u2022 Clerk SSO'
          : 'Artisan Verification Pending \u2022 Clerk SSO',
        badge,
        avatarPhoto: clerkUser.imageUrl || '',
        clerkUserId: clerkUser.id,
        authProvider: 'clerk',
        isLoggedIn: true
      }
    };
  }

  return {
    first,
    last,
    fullName,
    email,
    phone,
    badge,
    artisanVerified: false,
    payload: {
      name: first,
      fullName,
      email,
      phone,
      role: 'buyer',
      title: 'Verified Valley Buyer \u2022 Clerk SSO',
      badge,
      avatarPhoto: clerkUser.imageUrl || '',
      clerkUserId: clerkUser.id,
      authProvider: 'clerk',
      isLoggedIn: true
    }
  };
}

function SsoCallbackRunner() {
  const clerk = useClerk();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const pendingRole = readPendingClerkRole();
    const pendingMode = readPendingClerkAuthMode();
    const isSignInAttempt = pendingMode !== 'signup';
    const dest =
      pendingRole === 'artisan' ? '/auth?tab=verify&oauth_return=1' : '/login?oauth_return=1';
    const registerDest =
      pendingRole === 'artisan'
        ? '/auth?mode=register&not_registered=1'
        : '/login?mode=register&not_registered=1';
    const fallbackAuthDest =
      pendingRole === 'artisan'
        ? `/auth?mode=${isSignInAttempt ? 'signin' : 'register'}`
        : `/login?mode=${isSignInAttempt ? 'signin' : 'register'}`;

    const safetyTimer = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (clerk?.user || clerk?.session) {
        navigate(dest, { replace: true });
      } else {
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
        clearPendingClerkNext();
        navigate(isSignInAttempt ? registerDest : fallbackAuthDest, { replace: true });
      }
    }, 5500);

    return () => window.clearTimeout(safetyTimer);
  }, [clerk, navigate]);

  useEffect(() => {
    if (!clerk || !clerk.loaded || ranRef.current) return;
    ranRef.current = true;

    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const pendingRole = readPendingClerkRole();
    const pendingMode = readPendingClerkAuthMode();
    const isSignInAttempt = pendingMode !== 'signup';
    const dest =
      pendingRole === 'artisan' ? '/auth?tab=verify&oauth_return=1' : '/login?oauth_return=1';
    const registerDest =
      pendingRole === 'artisan'
        ? '/auth?mode=register&not_registered=1'
        : '/login?mode=register&not_registered=1';
    const fallbackAuthDest =
      pendingRole === 'artisan'
        ? `/auth?mode=${isSignInAttempt ? 'signin' : 'register'}`
        : `/login?mode=${isSignInAttempt ? 'signin' : 'register'}`;

    const go = (target) => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigate(target, { replace: true });
    };

    const ensureSessionActivated = async () => {
      if (clerk.user || clerk.session) return true;
      const createdId =
        clerk.client?.signIn?.createdSessionId || clerk.client?.signUp?.createdSessionId;
      if (createdId && typeof clerk.setActive === 'function') {
        try {
          await clerk.setActive({ session: createdId });
          return true;
        } catch {
          /* ignore */
        }
      }
      return Boolean(clerk.user || clerk.session);
    };

    Promise.resolve()
      .then(() =>
        clerk.handleRedirectCallback({
          transferable: !isSignInAttempt,
          signInUrl: `${base}${registerDest}`,
          signUpUrl: `${base}${registerDest}`,
          continueSignUpUrl: `${base}${registerDest}`,
          signInFallbackRedirectUrl: `${base}${dest}`,
          signUpFallbackRedirectUrl: `${base}${dest}`
        })
      )
      .then(async () => {
        if (doneRef.current) return;
        const currentPath =
          (window.location.pathname || '/').replace(new RegExp(`^${base}`), '') || '/';
        if (currentPath !== '/sso-callback') {
          doneRef.current = true;
          return;
        }
        const hasSession = await ensureSessionActivated();
        const siStatus = clerk.client?.signIn?.firstFactorVerification?.status;
        if (
          isSignInAttempt &&
          (!hasSession || (!clerk.user && (siStatus === 'transferable' || siStatus === 'failed')))
        ) {
          clearPendingClerkRole();
          clearPendingClerkAuthMode();
          clearPendingClerkNext();
          go(registerDest);
          return;
        }
        if (hasSession) {
          go(dest);
          return;
        }
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
        clearPendingClerkNext();
        go(isSignInAttempt ? registerDest : fallbackAuthDest);
      })
      .catch(async () => {
        if (doneRef.current) return;
        const hasSession = await ensureSessionActivated();
        if (hasSession) {
          go(dest);
          return;
        }
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
        clearPendingClerkNext();
        go(isSignInAttempt ? registerDest : fallbackAuthDest);
      });
  }, [clerk, clerk?.loaded, navigate]);

  return null;
}

function ClerkBridgeInner({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded: userLoaded, isSignedIn, user: clerkUser } = useUser();
  const { isLoaded: authLoaded, sessionId, getToken: clerkGetToken } = useAuth();
  const clerk = useClerk();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const {
    user: storeUser,
    setUser,
    buyerProfile,
    setBuyerProfile,
    hydrateFromBackend,
    clearSessionState
  } = useStore();

  const isLoaded = Boolean(userLoaded && authLoaded);
  const [isSyncingAuth, setIsSyncingAuth] = useState(false);
  const [authSyncError, setAuthSyncError] = useState('');
  const lastDbSyncKeyRef = useRef('');
  const syncInFlightRef = useRef(null);
  const syncedAccountIdsRef = useRef(new Set());
  const conflictSigningOutRef = useRef(false);

  const getCurrentAppPath = () => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return (window.location.pathname || '/').replace(new RegExp(`^${base}`), '') || '/';
  };

  const sanitizeBuyerDest = (raw) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned || !cleaned.startsWith('/') || cleaned.startsWith('//')) return '/';
    if (cleaned.startsWith('/login') || cleaned.startsWith('/sso-callback')) return '/';
    return cleaned;
  };

  /* Acquire a fresh Clerk RS256 session JWT, retrying briefly when Clerk has
     just finished an OAuth redirect callback and `useAuth().getToken()` takes
     a render tick or two to attach the active session. */
  const acquireClerkToken = useCallback(
    async ({ skipCache = false } = {}) => {
      const opts = skipCache ? { skipCache: true } : undefined;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          if (typeof clerkGetToken === 'function') {
            const t = await clerkGetToken(opts);
            if (t) return t;
          }
        } catch {
          /* retry via clerk.session below */
        }
        try {
          if (clerk?.session && typeof clerk.session.getToken === 'function') {
            const t = await clerk.session.getToken(opts);
            if (t) return t;
          }
        } catch {
          /* wait and retry */
        }
        if (attempt < 7) {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      }
      return null;
    },
    [clerk, clerkGetToken]
  );

  /* Sync the Clerk-authenticated user into HunarLink's FastAPI database
     (`users` + `user_role_assignments`) using a cryptographically verified
     Clerk RS256 session JWT, enforcing:
       1) Existing DB users/artisans attempting Register (`auth_mode='signup'`)
          get HTTP 409 Conflict -> immediately sign out & send to Sign In.
       2) Unregistered users attempting Sign In (`auth_mode='signin'`)
          get HTTP 404 Not Found -> immediately sign out & send to Register.
       3) Any artisan whose DB `verification_status !== 'APPROVED'` ALWAYS
          lands on `/auth?tab=verify` first (on signup, login, or /seller). */
  const syncUserToBackend = useCallback(
    async (clerkAccount, syncedMeta, requestedRole, authMode = 'sync', { force = false } = {}) => {
      if (!canAttemptBackend() || !clerkAccount?.id) return null;
      const syncKey = `${clerkAccount.id}:${requestedRole}:${authMode}`;
      if (!force && lastDbSyncKeyRef.current === syncKey && storeUser?.isLoggedIn) {
        return { alreadySynced: true };
      }
      if (syncInFlightRef.current) {
        return syncInFlightRef.current;
      }
      const email = syncedMeta.email || '';
      if (!email) return null;

      const run = (async () => {
        setIsSyncingAuth(true);
        setAuthSyncError('');
        try {
          let token = await acquireClerkToken({ skipCache: false });
          if (!token) {
            setAuthSyncError(
              'Could not obtain your Clerk session token yet. Please refresh or click Sign in again.'
            );
            return null;
          }

          const emailVerified = Boolean(
            clerkAccount.primaryEmailAddress?.verification?.status === 'verified'
          );
          const effectiveAuthMode =
            authMode === 'signup' && syncedAccountIdsRef.current.has(clerkAccount.id)
              ? 'sync'
              : authMode === 'signup' || authMode === 'signin'
                ? authMode
                : 'sync';
          const syncPayload = {
            email,
            email_verified: emailVerified,
            first_name: syncedMeta.first || 'Collector',
            last_name: syncedMeta.last || null,
            display_name: syncedMeta.fullName || syncedMeta.first || null,
            phone: syncedMeta.phone || null,
            requested_role: requestedRole === 'artisan' ? 'artisan' : 'buyer',
            auth_mode: effectiveAuthMode
          };

          let res;
          try {
            res = await syncAuthenticatedUser(syncPayload, token);
          } catch (firstErr) {
            if (firstErr?.status === 401) {
              // Fresh OAuth JWT may need a cache-bypassed refresh right after redirect
              await new Promise((resolve) => window.setTimeout(resolve, 350));
              const refreshedToken = await acquireClerkToken({ skipCache: true });
              if (!refreshedToken) throw firstErr;
              token = refreshedToken;
              res = await syncAuthenticatedUser(syncPayload, token);
            } else {
              throw firstErr;
            }
          }

          const savedNext = readPendingClerkNext();
          clearPendingClerkRole();
          clearPendingClerkAuthMode();
          clearPendingClerkNext();

          lastDbSyncKeyRef.current = syncKey;
          syncedAccountIdsRef.current.add(clerkAccount.id);

          const dbAccountType = res?.account_type || (res?.is_artisan ? 'artisan' : 'buyer');
          const dbHasArtisanRole = dbAccountType === 'artisan';
          const dbArtisanVerified = Boolean(res?.artisan_verified);
          const dbVerificationStatus =
            res?.seller_profile?.verification_status || 'UNVERIFIED';
          const effectiveRole = dbAccountType === 'artisan' ? 'artisan' : 'buyer';
          saveUserRole(clerkAccount.id, effectiveRole);

          if (dbHasArtisanRole || effectiveRole === 'artisan') {
            const existingLocal = readClerkArtisanProfile(clerkAccount.id) || {};
            const sp = res?.seller_profile || null;
            const mergedArtisan = {
              ...existingLocal,
              name: res?.display_name || syncedMeta.fullName || existingLocal.name || '',
              email: res?.email || syncedMeta.email || '',
              phone: res?.phone || syncedMeta.phone || existingLocal.phone || '',
              sellerProfileId: sp?.seller_profile_id || existingLocal.sellerProfileId || null,
              business: sp?.store_name || existingLocal.business || '',
              craft: sp?.craft_specialty || existingLocal.craft || '',
              district: sp?.workshop_district || existingLocal.district || '',
              giCertified: sp?.verification_path === 'GI' && dbArtisanVerified,
              giId: sp?.claimed_gi_authorized_user_no || existingLocal.giId || null,
              verificationPath: sp?.verification_path || existingLocal.verificationPath || null,
              verificationStatus: dbVerificationStatus,
              profileStatus: sp?.profile_status || 'DRAFT',
              applicationNumber: sp?.latest_application_number || existingLocal.applicationNumber || null,
              reviewDecisionNotes: sp?.review_decision_notes || null,
              artisanVerified: dbArtisanVerified,
              title: dbArtisanVerified
                ? 'Verified Artisan \u2022 HunarLink DB'
                : dbVerificationStatus === 'SUBMITTED'
                  ? 'Artisan Verification Pending Review'
                  : 'Artisan Verification Required'
            };
            saveClerkArtisanProfile(clerkAccount.id, mergedArtisan);
          }

          const refreshed = buildSyncedUser(clerkAccount, effectiveRole);
          setUser(
            {
              ...refreshed.payload,
              role: effectiveRole,
              artisanVerified: dbHasArtisanRole ? dbArtisanVerified : false,
              verificationStatus: dbVerificationStatus,
              sellerProfile: res?.seller_profile || null,
              sellerProfileId: res?.seller_profile?.seller_profile_id || null,
              applicationNumber: res?.seller_profile?.latest_application_number || null,
              reviewDecisionNotes: res?.seller_profile?.review_decision_notes || null,
              dbUserId: res?.user_id || null,
              dbRoles: res?.roles || [],
              isAdmin: Boolean(res?.is_admin)
            },
            { silent: true }
          );

          if (effectiveRole === 'buyer') {
            setBuyerProfile({
              ...(buyerProfile || {}),
              firstName: syncedMeta.first,
              lastName: syncedMeta.last,
              fullName: syncedMeta.fullName,
              email: syncedMeta.email,
              phone: syncedMeta.phone || buyerProfile?.phone || '',
              avatarPhoto: clerkAccount.imageUrl || buyerProfile?.avatarPhoto || '',
              badge: syncedMeta.badge,
              role: 'buyer',
              isLoggedIn: true
            });
          }

          const currentPath = getCurrentAppPath();
          const currentSearch = window.location.search || '';
          const isOAuthReturn = currentSearch.includes('oauth_return=1');
          const isSellerPath = currentPath === '/seller';

          if (effectiveRole === 'artisan' && !dbArtisanVerified) {
            if (currentPath === '/login' || currentPath === '/sso-callback' || isSellerPath) {
              navigate('/auth?tab=verify', { replace: true });
            }
          } else if (isSellerPath && !dbArtisanVerified) {
            navigate('/auth?tab=verify', { replace: true });
          } else if (effectiveRole === 'artisan' && dbArtisanVerified) {
            if (
              currentPath === '/login' ||
              currentPath === '/sso-callback' ||
              (currentPath === '/auth' && isOAuthReturn)
            ) {
              navigate('/seller', { replace: true });
            }
          } else if (effectiveRole === 'buyer' && (currentPath === '/login' || currentPath === '/sso-callback')) {
            navigate(sanitizeBuyerDest(savedNext), { replace: true });
          }
          if (import.meta.env.DEV) {
            console.info(
              `[HunarLink DB] ${res.is_new_user ? 'Created new' : 'Synced'} user ${res.email} (id=${res.user_id}, roles=${res.roles.join(',')}, artisan_verified=${dbArtisanVerified})`
            );
          }
          await hydrateFromBackend(token);
          return res;
        } catch (err) {
          if (err?.status === 404) {
            // Strict DB login check: email/user does NOT exist in HunarLink DB ->
            // sign out Clerk immediately and redirect to Register page for the respective role!
            conflictSigningOutRef.current = true;
            clearPendingClerkRole();
            clearPendingClerkAuthMode();
            clearPendingClerkNext();
            lastDbSyncKeyRef.current = '';
            syncedAccountIdsRef.current.clear();
            clearSessionState();
            setUser(null, { silent: true });
            try {
              if (clerk?.signOut) {
                await clerk.signOut(() => {});
              }
            } catch {
              /* ignore */
            }
            conflictSigningOutRef.current = false;
            const registerDest =
              requestedRole === 'artisan'
                ? '/auth?mode=register&not_registered=1'
                : '/login?mode=register&not_registered=1';
            navigate(registerDest, { replace: true });
            return null;
          }
          if (err?.status === 409 && authMode === 'signup' && !String(err?.message || '').includes('_accounts')) {
            conflictSigningOutRef.current = true;
            clearPendingClerkRole();
            clearPendingClerkAuthMode();
            clearPendingClerkNext();
            lastDbSyncKeyRef.current = '';
            syncedAccountIdsRef.current.clear();
            clearSessionState();
            setUser(null, { silent: true });
            try {
              if (clerk?.signOut) {
                await clerk.signOut(() => {});
              }
            } catch {
              /* ignore */
            }
            conflictSigningOutRef.current = false;
            const roleQuery = requestedRole === 'artisan' ? '&role=artisan' : '';
            navigate(`/login?mode=signin&already_registered=1${roleQuery}`, { replace: true });
            return null;
          }
          if (err?.status === 409) {
            conflictSigningOutRef.current = true;
            clearPendingClerkRole();
            clearPendingClerkAuthMode();
            clearPendingClerkNext();
            lastDbSyncKeyRef.current = '';
            syncedAccountIdsRef.current.clear();
            clearSessionState();
            setUser(null, { silent: true });
            try {
              if (clerk?.signOut) {
                await clerk.signOut(() => {});
              }
            } catch {
              /* ignore */
            }
            conflictSigningOutRef.current = false;
            setAuthSyncError(
              err?.message ||
                'This email is already registered under a different sign-in identity. Please use your original sign-in method.'
            );
            navigate('/login?mode=signin&sync_error=1', { replace: true });
            return null;
          }
          setAuthSyncError(
            err?.message ||
              'Could not verify your account with HunarLink backend. Ensure FastAPI (:8000) is running and try again.'
          );
          if (import.meta.env.DEV) {
            console.warn(
              `[HunarLink DB] Could not sync Clerk user to FastAPI (${err?.status || 'offline'}): ${err?.message || 'unknown error'}`
            );
          }
          return null;
        } finally {
          syncInFlightRef.current = null;
          setIsSyncingAuth(false);
        }
      })();

      syncInFlightRef.current = run;
      return run;
    },
    [
      acquireClerkToken,
      buyerProfile,
      clerk,
      clearSessionState,
      hydrateFromBackend,
      navigate,
      setBuyerProfile,
      setUser,
      storeUser?.isLoggedIn
    ]
  );

  /* Mirror the live Clerk user into StoreContext ONLY after verifying against
     HunarLink's database when the backend is active (prevents unregistered
     Google/Apple sign-ins from ever entering the app). */
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !clerkUser) {
      lastDbSyncKeyRef.current = '';
      syncInFlightRef.current = null;
      syncedAccountIdsRef.current.clear();
      setIsSyncingAuth(false);
      clearSessionState();
      if (storeUser) {
        setUser(null, { silent: true });
      }
      return;
    }

    if (conflictSigningOutRef.current) return;

    // Wait for <SsoCallbackRunner /> on /sso-callback to finish navigating to
    // /login or /auth before validating against MySQL DB so its redirect cannot
    // overwrite our 404/409 bounces.
    if (getCurrentAppPath() === '/sso-callback') return;

    const pendingRole = readPendingClerkRole();
    const pendingAuthMode = readPendingClerkAuthMode();

    const roleMap = readRoleMap();
    const metaRole = clerkUser.publicMetadata?.role;
    const resolvedRole =
      pendingRole ||
      roleMap[clerkUser.id] ||
      (metaRole === 'artisan' || metaRole === 'buyer' ? metaRole : null) ||
      'buyer';

    saveUserRole(clerkUser.id, resolvedRole);

    const synced = buildSyncedUser(clerkUser, resolvedRole);
    const effectiveAuthMode =
      pendingAuthMode === 'signup'
        ? 'signup'
        : syncedAccountIdsRef.current.has(clerkUser.id)
          ? 'sync'
          : 'signin';

    if (canAttemptBackend()) {
      // Wait for FastAPI DB verification (200 OK) before marking user logged in.
      syncUserToBackend(clerkUser, synced, resolvedRole, effectiveAuthMode);
      return;
    }

    // Static preview fallback when backend is offline
    clearPendingClerkRole();
    clearPendingClerkAuthMode();
    const savedNext = readPendingClerkNext();
    clearPendingClerkNext();

    setUser(synced.payload, { silent: true });
    if (resolvedRole === 'buyer') {
      setBuyerProfile({
        ...(buyerProfile || {}),
        firstName: synced.first,
        lastName: synced.last,
        fullName: synced.fullName,
        email: synced.email,
        phone: synced.phone || buyerProfile?.phone || '',
        avatarPhoto: clerkUser.imageUrl || buyerProfile?.avatarPhoto || '',
        badge: synced.badge,
        role: 'buyer',
        isLoggedIn: true
      });
      const currentPath = getCurrentAppPath();
      if (currentPath === '/login' || currentPath === '/sso-callback') {
        navigate(sanitizeBuyerDest(savedNext), { replace: true });
      }
    } else if (resolvedRole === 'artisan' && !synced.artisanVerified) {
      const currentPath = getCurrentAppPath();
      if (
        currentPath === '/login' ||
        currentPath === '/sso-callback' ||
        currentPath === '/seller'
      ) {
        navigate('/auth?tab=verify', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, sessionId, clerkUser?.id, clerkUser?.updatedAt, location.pathname]);

  const authenticateWithOAuth = useCallback(
    async (provider, { role = 'user', mode = 'signin', redirectTo = '/' } = {}) => {
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      const useSignUpFlow = mode === 'signup' || mode === 'register';
      const normalizedAuthMode = useSignUpFlow ? 'signup' : 'signin';
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

      /* If already signed in via Clerk, verify against DB first rather than
         letting Clerk throw "You're already signed in" or bypassing DB checks. */
      if (isSignedIn && clerkUser) {
        saveUserRole(clerkUser.id, normalizedRole);
        const synced = buildSyncedUser(clerkUser, normalizedRole);
        if (canAttemptBackend()) {
          const res = await syncUserToBackend(
            clerkUser,
            synced,
            normalizedRole,
            normalizedAuthMode,
            { force: true }
          );
          if (!res) {
            return { redirected: false };
          }
          const dbVerified = Boolean(res?.artisan_verified);
          if (normalizedRole === 'artisan') {
            return {
              alreadySignedIn: true,
              destination: dbVerified ? '/seller' : '/auth?tab=verify',
              artisanVerified: dbVerified
            };
          }
          return {
            alreadySignedIn: true,
            destination: sanitizeBuyerDest(redirectTo),
            artisanVerified: false
          };
        }

        setUser(synced.payload, { silent: true });
        if (normalizedRole === 'buyer') {
          setBuyerProfile({
            ...(buyerProfile || {}),
            firstName: synced.first,
            lastName: synced.last,
            fullName: synced.fullName,
            email: synced.email,
            phone: synced.phone || buyerProfile?.phone || '',
            avatarPhoto: clerkUser.imageUrl || buyerProfile?.avatarPhoto || '',
            badge: synced.badge,
            role: 'buyer',
            isLoggedIn: true
          });
          return { alreadySignedIn: true, destination: sanitizeBuyerDest(redirectTo), artisanVerified: false };
        }

        const artisanDest = synced.artisanVerified
          ? '/seller'
          : '/auth?tab=verify';
        return {
          alreadySignedIn: true,
          destination: artisanDest,
          artisanVerified: synced.artisanVerified
        };
      }

      const ready = useSignUpFlow ? signUpLoaded && signUp : signInLoaded && signIn;
      if (!ready) {
        throw new Error('Clerk is still initialising. Please try again in a moment.');
      }

      const strategy =
        String(provider || '').toLowerCase() === 'apple' ? 'oauth_apple' : 'oauth_google';
      const origin = window.location.origin;
      // Always route OAuth callback through /login?oauth_return=1 (buyer) or
      // /auth?tab=verify&oauth_return=1 (artisan) so ClerkBoundary validates
      // registration against MySQL DB BEFORE entering / or /seller, and shows
      // a seamless handoff state instead of flashing the Sign-In form.
      const destPath =
        normalizedRole === 'artisan'
          ? '/auth?tab=verify&oauth_return=1'
          : '/login?oauth_return=1';
      const redirectUrl = `${origin}${base}/sso-callback`;
      const redirectUrlComplete = `${origin}${base}${destPath}`;

      setPendingClerkRole(normalizedRole);
      setPendingClerkAuthMode(normalizedAuthMode);
      setPendingClerkNext(sanitizeBuyerDest(redirectTo));

      const resource = useSignUpFlow ? signUp : signIn;
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(
            new Error(
              `Clerk did not start the ${provider} redirect in time. Check that ${provider} is enabled in your Clerk Dashboard and allowed for ${origin}.`
            )
          );
        }, 12000);
      });

      try {
        await Promise.race([
          resource.authenticateWithRedirect({
            strategy,
            redirectUrl,
            redirectUrlComplete
          }),
          timeoutPromise
        ]);
        return { redirected: true };
      } catch (err) {
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
        clearPendingClerkNext();
        throw new Error(formatClerkError(err, provider));
      }
    },
    [buyerProfile, clerkUser, isSignedIn, setBuyerProfile, setUser, signIn, signInLoaded, signUp, signUpLoaded, syncUserToBackend]
  );

  const signOutClerk = useCallback(async () => {
    clearPendingClerkRole();
    clearPendingClerkAuthMode();
    clearPendingClerkNext();
    lastDbSyncKeyRef.current = '';
    syncInFlightRef.current = null;
    setAuthSyncError('');
    clearSessionState();
    setUser(null, { silent: true });
    if (isSignedIn && clerk?.signOut) {
      await clerk.signOut(() => {});
    }
  }, [clerk, clearSessionState, isSignedIn, setUser]);

  const renderSsoCallback = useCallback(() => <SsoCallbackRunner />, []);

  const getToken = useCallback(async () => {
    if (!isSignedIn || typeof clerkGetToken !== 'function') return null;
    try {
      return (await clerkGetToken()) || null;
    } catch {
      return null;
    }
  }, [isSignedIn, clerkGetToken]);

  const sendEmailCode = useCallback(
    async (emailAddress, role = 'buyer', authMode = 'signin', password = '') => {
      const cleaned = String(emailAddress || '').trim().toLowerCase();
      if (!cleaned || !cleaned.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      const trimmedPassword = String(password || '');
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      const normalizedMode = authMode === 'register' || authMode === 'signup' ? 'signup' : 'signin';
      if (normalizedMode === 'signup' && trimmedPassword && trimmedPassword.length < 15) {
        throw new Error('Password must be at least 15 characters long.');
      }
      setPendingClerkRole(normalizedRole);
      setPendingClerkAuthMode(normalizedMode);

      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) {
        throw new Error('Authentication service is initializing. Please retry.');
      }

      // 1. Live HunarLink DB check BEFORE calling Clerk:
      //    - Strict 3-table separation (`buyer_accounts`, `artisan_accounts`, `admin_accounts`):
      //      an email registered under a different account type cannot sign in or register here.
      //    - Existing DB user/artisan CANNOT register again (must log in).
      //    - Non-existent user on Sign In is directed cleanly to Register.
      if (canAttemptBackend()) {
        try {
          const acct = await checkAuthAccount(cleaned);
          if (acct?.exists && acct.account_type && acct.account_type !== normalizedRole) {
            const ownerLabel =
              acct.account_type === 'admin'
                ? 'Administrator'
                : acct.account_type === 'artisan'
                  ? 'Artisan'
                  : 'Buyer';
            const reqLabel = normalizedRole === 'artisan' ? 'Artisan' : 'Buyer';
            const mismatchErr = new Error(
              `This email is registered as a ${ownerLabel} account (in \`${acct.account_table || `${acct.account_type}_accounts`}\`) and cannot be used as a ${reqLabel} account.`
            );
            mismatchErr.code = 'ROLE_MISMATCH';
            throw mismatchErr;
          }
          if (normalizedMode === 'signup' && acct?.exists) {
            const dupErr = new Error(
              'This email already exists in HunarLink. You cannot register again — please Sign In instead.'
            );
            dupErr.code = 'ALREADY_REGISTERED';
            throw dupErr;
          }
          if (normalizedMode === 'signin' && acct && acct.exists === false) {
            const missErr = new Error(
              'No HunarLink account exists for this email yet. Please switch to Register to create one.'
            );
            missErr.code = 'NOT_REGISTERED';
            throw missErr;
          }
        } catch (checkErr) {
          if (
            checkErr?.code === 'ALREADY_REGISTERED' ||
            checkErr?.code === 'NOT_REGISTERED' ||
            checkErr?.code === 'ROLE_MISMATCH'
          ) {
            clearPendingClerkRole();
            clearPendingClerkAuthMode();
            throw checkErr;
          }
          // Backend unreachable (static preview): proceed to Clerk
        }
      }

      if (normalizedMode === 'signup') {
        try {
          const createParams = { emailAddress: cleaned };
          if (trimmedPassword) {
            createParams.password = trimmedPassword;
          }
          await signUp.create(createParams);
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          return { flow: 'signUp' };
        } catch (err) {
          clearPendingClerkRole();
          clearPendingClerkAuthMode();
          const errCode = err?.errors?.[0]?.code || '';
          const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || '';
          if (errCode === 'form_identifier_exists' || msg.toLowerCase().includes('already')) {
            const dupErr = new Error(
              'This email already exists. You cannot register again — please Sign In instead.'
            );
            dupErr.code = 'ALREADY_REGISTERED';
            throw dupErr;
          }
          throw new Error(msg || 'Could not send registration verification code.');
        }
      }

      // Sign-In mode: NEVER silently fall back to signUp.create
      try {
        const si = await signIn.create({ identifier: cleaned });
        const emailFactor = si.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
        if (!emailFactor) {
          throw new Error('Use "Sign in with Google" or "Sign in with Apple" for this account.');
        }
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId
        });
        return { flow: 'signIn' };
      } catch (err) {
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
        const errCode = err?.errors?.[0]?.code || '';
        const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || '';
        if (errCode === 'form_identifier_not_found' || msg.toLowerCase().includes("couldn't find")) {
          const missErr = new Error(
            'No account found for this email yet. Please switch to Register to create one.'
          );
          missErr.code = 'NOT_REGISTERED';
          throw missErr;
        }
        throw new Error(msg || 'Could not send sign-in verification code.');
      }
    },
    [signIn, signInLoaded, signUp, signUpLoaded]
  );

  const verifyEmailCode = useCallback(
    async (code, flow = 'signIn', password = '') => {
      if (isSignedIn && clerkUser) {
        return true;
      }
      const cleaned = String(code || '').trim();
      const trimmedPassword = String(password || '');
      if (flow === 'signIn') {
        if (signIn?.status === 'complete' && signIn?.createdSessionId) {
          await clerk.setActive({ session: signIn.createdSessionId });
          return true;
        }
        try {
          const res =
            signIn?.status === 'needs_second_factor' && typeof signIn.attemptSecondFactor === 'function'
              ? await signIn.attemptSecondFactor({ strategy: 'email_code', code: cleaned })
              : await signIn.attemptFirstFactor({ strategy: 'email_code', code: cleaned });
          if (res.status === 'complete' && res.createdSessionId) {
            await clerk.setActive({ session: res.createdSessionId });
            return true;
          }
        } catch (err) {
          const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || '';
          if (msg.toLowerCase().includes('already') && signIn?.createdSessionId) {
            await clerk.setActive({ session: signIn.createdSessionId });
            return true;
          }
          throw new Error(msg || 'Invalid or expired verification code.');
        }
      } else {
        const finalizeSignUp = async (suResource) => {
          let current = suResource || signUp;
          if (!current) return false;
          if (current.status === 'complete' && current.createdSessionId) {
            await clerk.setActive({ session: current.createdSessionId });
            return true;
          }
          if (current.status === 'missing_requirements') {
            const missing = Array.isArray(current.missingFields) ? current.missingFields : [];
            const emailStr =
              current.emailAddress ||
              current.verifications?.emailAddress?.nextAction ||
              'artisan';
            const localPrefix =
              String(emailStr)
                .split('@')[0]
                .replace(/[^a-zA-Z0-9_]/g, '')
                .slice(0, 20) || 'hunarlink';
            const patch = {};
            if (missing.includes('first_name')) patch.firstName = localPrefix;
            if (missing.includes('last_name')) patch.lastName = 'Member';
            if (missing.includes('username')) {
              patch.username = `${localPrefix}_${Math.floor(1000 + Math.random() * 9000)}`;
            }
            if (missing.includes('password')) {
              const randTail = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
              patch.password =
                trimmedPassword.length >= 15
                  ? trimmedPassword
                  : `Hl!Kmr#${randTail.slice(0, 12)}9A@2026`;
            }
            if (missing.includes('legal_accepted')) {
              patch.legalAccepted = true;
            }
            if (Object.keys(patch).length > 0 && typeof current.update === 'function') {
              current = await current.update(patch);
              if (current.status === 'complete' && current.createdSessionId) {
                await clerk.setActive({ session: current.createdSessionId });
                return true;
              }
            }
          }
          return false;
        };

        if (signUp?.verifications?.emailAddress?.status === 'verified') {
          if (await finalizeSignUp(signUp)) return true;
        }

        try {
          const res = await signUp.attemptEmailAddressVerification({ code: cleaned });
          if (await finalizeSignUp(res)) return true;
        } catch (err) {
          const errCode = err?.errors?.[0]?.code || '';
          const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || '';
          if (
            errCode === 'verification_already_verified' ||
            msg.toLowerCase().includes('already been verified')
          ) {
            if (await finalizeSignUp(signUp)) return true;
            if (isSignedIn) return true;
            const switchErr = new Error(
              'Email verified. Please enter a fresh Sign-In code below to continue.'
            );
            switchErr.code = 'SWITCH_TO_SIGNIN';
            throw switchErr;
          }
          throw new Error(msg || 'Invalid or expired verification code.');
        }
      }
      throw new Error('Verification incomplete. Please request a fresh code.');
    },
    [clerk, clerkUser, isSignedIn, signIn, signUp]
  );

  const signInWithPassword = useCallback(
    async (emailAddress, password, role = 'buyer') => {
      const cleaned = String(emailAddress || '').trim().toLowerCase();
      if (!cleaned || !cleaned.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password) {
        throw new Error('Please enter your password.');
      }
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      setPendingClerkRole(normalizedRole);
      setPendingClerkAuthMode('signin');

      if (!signInLoaded || !signIn) {
        throw new Error('Authentication service is initializing. Please retry.');
      }

      if (canAttemptBackend()) {
        try {
          const acct = await checkAuthAccount(cleaned);
          if (acct?.exists && acct.account_type && acct.account_type !== normalizedRole) {
            const ownerLabel =
              acct.account_type === 'admin'
                ? 'Administrator'
                : acct.account_type === 'artisan'
                  ? 'Artisan'
                  : 'Buyer';
            const reqLabel = normalizedRole === 'artisan' ? 'Artisan' : 'Buyer';
            const mismatchErr = new Error(
              `This email is registered as a ${ownerLabel} account (in \`${acct.account_table || `${acct.account_type}_accounts`}\`) and cannot be used as a ${reqLabel} account.`
            );
            mismatchErr.code = 'ROLE_MISMATCH';
            throw mismatchErr;
          }
          if (acct && acct.exists === false) {
            const missErr = new Error(
              'No HunarLink account exists for this email yet. Please switch to Register to create one.'
            );
            missErr.code = 'NOT_REGISTERED';
            throw missErr;
          }
        } catch (checkErr) {
          if (checkErr?.code === 'NOT_REGISTERED' || checkErr?.code === 'ROLE_MISMATCH') {
            clearPendingClerkRole();
            clearPendingClerkAuthMode();
            throw checkErr;
          }
        }
      }

      try {
        const res = await signIn.create({
          identifier: cleaned,
          password: String(password)
        });
        if (res.status === 'complete' && res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
          return { status: 'complete' };
        }
        if (res.status === 'needs_second_factor') {
          const emailSecond = res.supportedSecondFactors?.find((f) => f.strategy === 'email_code');
          if (emailSecond) {
            await signIn.prepareSecondFactor({
              strategy: 'email_code',
              emailAddressId: emailSecond.emailAddressId
            });
            return { status: 'needs_second_factor', strategy: 'email_code' };
          }
        }
        const emailFirst = res.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
        if (res.status === 'needs_first_factor' && emailFirst) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailFirst.emailAddressId
          });
          return { status: 'needs_email_code' };
        }
        throw new Error(
          'Password sign-in could not complete for this account. Try "Send Sign-In Code" or Google.'
        );
      } catch (err) {
        clearPendingClerkRole();
        clearPendingClerkAuthMode();
        const errCode = err?.errors?.[0]?.code || '';
        const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || '';
        if (errCode === 'form_identifier_not_found' || msg.toLowerCase().includes("couldn't find")) {
          const missErr = new Error(
            'No account found for this email yet. Please switch to Register to create one.'
          );
          missErr.code = 'NOT_REGISTERED';
          throw missErr;
        }
        throw new Error(msg || 'Invalid email or password.');
      }
    },
    [clerk, signIn, signInLoaded]
  );

  const bridgeValue = useMemo(
    () => ({
      enabled: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      isSyncingAuth,
      authSyncError,
      clerkUser: clerkUser || null,
      getToken,
      authenticateWithOAuth,
      sendEmailCode,
      verifyEmailCode,
      signInWithPassword,
      signOutClerk,
      renderSsoCallback
    }),
    [
      isLoaded,
      isSignedIn,
      isSyncingAuth,
      authSyncError,
      clerkUser,
      getToken,
      authenticateWithOAuth,
      sendEmailCode,
      verifyEmailCode,
      signInWithPassword,
      signOutClerk,
      renderSsoCallback
    ]
  );

  return (
    <ClerkBridgeContext.Provider value={bridgeValue}>
      {children}
    </ClerkBridgeContext.Provider>
  );
}

function toRouterPath(to) {
  if (!to) return '/';
  try {
    const u = new URL(to, window.location.origin);
    if (u.origin !== window.location.origin) {
      // Never dump HunarLink users onto Clerk's hosted Account Portal
      // (e.g. *.accounts.dev/sign-up/tasks/choose-organization). Keep them in-app!
      if (
        u.hostname.endsWith('.accounts.dev') &&
        (u.pathname.includes('/tasks/') ||
          u.pathname.startsWith('/sign-up') ||
          u.pathname.startsWith('/sign-in'))
      ) {
        const pendingRole = readPendingClerkRole();
        const pendingMode = readPendingClerkAuthMode();
        if (pendingMode !== 'signup') {
          return pendingRole === 'artisan'
            ? '/auth?mode=register&not_registered=1'
            : '/login?mode=register&not_registered=1';
        }
        return pendingRole === 'artisan' ? '/auth?tab=verify' : '/login';
      }
      window.location.assign(to);
      return null;
    }
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    let p = u.pathname;
    if (base && p.startsWith(base)) p = p.slice(base.length) || '/';
    return `${p}${u.search}${u.hash}`;
  } catch {
    return to;
  }
}

export default function ClerkBoundary({ children }) {
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.replace(/\/$/, '');

  const routerPush = useCallback(
    (to) => {
      const target = toRouterPath(to);
      if (target) navigate(target);
    },
    [navigate]
  );

  const routerReplace = useCallback(
    (to) => {
      const target = toRouterPath(to);
      if (target) navigate(target, { replace: true });
    },
    [navigate]
  );

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl={`${cleanBase}/login`}
      signUpUrl={`${cleanBase}/login?mode=register`}
      taskUrls={{
        'choose-organization': `${cleanBase}/login`
      }}
      afterSignOutUrl={base}
      routerPush={routerPush}
      routerReplace={routerReplace}
    >
      <ClerkBridgeInner>{children}</ClerkBridgeInner>
    </ClerkProvider>
  );
}
