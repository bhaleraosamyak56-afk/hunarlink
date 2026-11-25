import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AuthenticateWithRedirectCallback,
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
  clearPendingClerkRole,
  readClerkArtisanProfile,
  readPendingClerkAuthMode,
  readPendingClerkRole,
  saveClerkArtisanProfile,
  setPendingClerkAuthMode,
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

function ClerkBridgeInner({ children }) {
  const navigate = useNavigate();
  const { isLoaded: userLoaded, isSignedIn, user: clerkUser } = useUser();
  const { isLoaded: authLoaded, getToken: clerkGetToken } = useAuth();
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
  const lastDbSyncKeyRef = useRef('');
  const conflictSigningOutRef = useRef(false);

  const getCurrentAppPath = () => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return (window.location.pathname || '/').replace(new RegExp(`^${base}`), '') || '/';
  };

  /* Sync the Clerk-authenticated user into HunarLink's FastAPI database
     (`users` + `user_role_assignments`) using a cryptographically verified
     Clerk RS256 session JWT, enforcing:
       1) Existing DB users/artisans attempting Register (`auth_mode='signup'`)
          get HTTP 409 Conflict -> immediately sign out & send to Sign In.
       2) Any artisan whose DB `verification_status !== 'APPROVED'` ALWAYS
          lands on `/auth?tab=verify` first (on signup, login, or /seller). */
  const syncUserToBackend = useCallback(
    async (clerkAccount, syncedMeta, requestedRole, authMode = 'sync') => {
      if (!canAttemptBackend() || !clerkAccount?.id || !clerkGetToken) return null;
      const syncKey = `${clerkAccount.id}:${requestedRole}:${authMode}`;
      if (lastDbSyncKeyRef.current === syncKey) return null;
      const email = syncedMeta.email || '';
      if (!email) return null;

      try {
        const token = await clerkGetToken();
        if (!token) return null;
        const emailVerified = Boolean(
          clerkAccount.primaryEmailAddress?.verification?.status === 'verified'
        );
        const res = await syncAuthenticatedUser(
          {
            email,
            email_verified: emailVerified,
            first_name: syncedMeta.first || 'Collector',
            last_name: syncedMeta.last || null,
            display_name: syncedMeta.fullName || syncedMeta.first || null,
            phone: syncedMeta.phone || null,
            requested_role: requestedRole === 'artisan' ? 'artisan' : 'buyer',
            auth_mode: authMode === 'signup' || authMode === 'signin' ? authMode : 'sync'
          },
          token
        );
        lastDbSyncKeyRef.current = syncKey;

        const dbIsArtisan = Boolean(res?.is_artisan) || requestedRole === 'artisan';
        const dbArtisanVerified = Boolean(res?.artisan_verified);
        const dbVerificationStatus =
          res?.seller_profile?.verification_status || 'UNVERIFIED';
        const effectiveRole = dbIsArtisan ? 'artisan' : 'buyer';
        saveUserRole(clerkAccount.id, effectiveRole);

        if (dbIsArtisan) {
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
            artisanVerified: dbIsArtisan ? dbArtisanVerified : false,
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

        const currentPath = getCurrentAppPath();
        const isEntryOrAuth =
          currentPath === '/' ||
          currentPath === '/index.html' ||
          currentPath === '/login' ||
          currentPath === '/sso-callback';
        const isSellerPath = currentPath === '/seller';

        if (dbIsArtisan && !dbArtisanVerified) {
          if (isEntryOrAuth || isSellerPath) {
            navigate('/auth?tab=verify', { replace: true });
          }
        } else if (dbIsArtisan && dbArtisanVerified) {
          if (currentPath === '/login' || currentPath === '/sso-callback') {
            navigate('/seller', { replace: true });
          }
        } else if (!dbIsArtisan && (currentPath === '/login' || currentPath === '/sso-callback')) {
          navigate('/dashboard', { replace: true });
        }
        if (import.meta.env.DEV) {
          console.info(
            `[HunarLink DB] ${res.is_new_user ? 'Created new' : 'Synced'} user ${res.email} (id=${res.user_id}, roles=${res.roles.join(',')}, artisan_verified=${dbArtisanVerified})`
          );
        }
        await hydrateFromBackend(token);
        return res;
      } catch (err) {
        if (err?.status === 409 && authMode === 'signup') {
          conflictSigningOutRef.current = true;
          clearPendingClerkRole();
          clearPendingClerkAuthMode();
          lastDbSyncKeyRef.current = '';
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
        if (import.meta.env.DEV) {
          console.warn(
            `[HunarLink DB] Could not sync Clerk user to FastAPI (${err?.status || 'offline'}): ${err?.message || 'unknown error'}`
          );
        }
        return null;
      }
    },
    [clerk, clerkGetToken, clearSessionState, hydrateFromBackend, navigate, setUser]
  );

  /* Mirror the live Clerk user into StoreContext so Header, ProfilePage,
     OrdersPage, AuthPage and SellerPage all reflect the authenticated session. */
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !clerkUser) {
      lastDbSyncKeyRef.current = '';
      clearSessionState();
      if (storeUser) {
        setUser(null, { silent: true });
      }
      return;
    }

    if (conflictSigningOutRef.current) return;

    const pendingRole = readPendingClerkRole();
    const pendingAuthMode = readPendingClerkAuthMode();
    if (pendingRole) clearPendingClerkRole();
    if (pendingAuthMode) clearPendingClerkAuthMode();

    const roleMap = readRoleMap();
    const metaRole = clerkUser.publicMetadata?.role;
    const resolvedRole =
      pendingRole ||
      (metaRole === 'artisan' || metaRole === 'buyer' ? metaRole : null) ||
      roleMap[clerkUser.id] ||
      'buyer';

    saveUserRole(clerkUser.id, resolvedRole);

    const synced = buildSyncedUser(clerkUser, resolvedRole);
    setUser(synced.payload, { silent: true });
    syncUserToBackend(
      clerkUser,
      synced,
      resolvedRole,
      pendingAuthMode === 'signup' || pendingAuthMode === 'signin' ? pendingAuthMode : 'sync'
    );

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
    } else if (resolvedRole === 'artisan' && !synced.artisanVerified) {
      /* Even before backend hydration finishes, route unverified artisans
         from auth/home/seller straight to the verification page first. */
      const currentPath = getCurrentAppPath();
      if (
        currentPath === '/' ||
        currentPath === '/index.html' ||
        currentPath === '/login' ||
        currentPath === '/sso-callback' ||
        currentPath === '/seller'
      ) {
        navigate('/auth?tab=verify', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, clerkUser?.id, clerkUser?.updatedAt]);

  const authenticateWithOAuth = useCallback(
    async (provider, { role = 'user', mode = 'signin', redirectTo = '/' } = {}) => {
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

      /* If already signed in via Clerk, switch HunarLink workspace directly
         rather than letting Clerk throw "You're already signed in". */
      if (isSignedIn && clerkUser) {
        saveUserRole(clerkUser.id, normalizedRole);
        const synced = buildSyncedUser(clerkUser, normalizedRole);
        setUser(synced.payload, { silent: true });
        syncUserToBackend(clerkUser, synced, normalizedRole);

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
          const buyerDest = (redirectTo || '/').startsWith('/') ? (redirectTo || '/') : `/${redirectTo}`;
          return { alreadySignedIn: true, destination: buyerDest, artisanVerified: false };
        }

        const artisanDest = synced.artisanVerified
          ? '/seller'
          : '/auth?mode=register&step=verify';
        return {
          alreadySignedIn: true,
          destination: artisanDest,
          artisanVerified: synced.artisanVerified
        };
      }

      const useSignUpFlow = mode === 'signup' || mode === 'register';
      const normalizedAuthMode = useSignUpFlow ? 'signup' : 'signin';
      const ready = useSignUpFlow ? signUpLoaded && signUp : signInLoaded && signIn;
      if (!ready) {
        throw new Error('Clerk is still initialising. Please try again in a moment.');
      }

      const strategy =
        String(provider || '').toLowerCase() === 'apple' ? 'oauth_apple' : 'oauth_google';
      const origin = window.location.origin;
      const destPath =
        normalizedRole === 'artisan'
          ? '/auth?tab=verify'
          : (redirectTo || '/').startsWith('/')
            ? redirectTo || '/'
            : `/${redirectTo}`;
      const redirectUrl = `${origin}${base}/sso-callback`;
      const redirectUrlComplete = `${origin}${base}${destPath}`;

      setPendingClerkRole(normalizedRole);
      setPendingClerkAuthMode(normalizedAuthMode);

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
        throw new Error(formatClerkError(err, provider));
      }
    },
    [buyerProfile, clerkUser, isSignedIn, setBuyerProfile, setUser, signIn, signInLoaded, signUp, signUpLoaded, syncUserToBackend]
  );

  const signOutClerk = useCallback(async () => {
    clearPendingClerkRole();
    clearPendingClerkAuthMode();
    lastDbSyncKeyRef.current = '';
    clearSessionState();
    setUser(null, { silent: true });
    if (isSignedIn && clerk?.signOut) {
      await clerk.signOut(() => {});
    }
  }, [clerk, clearSessionState, isSignedIn, setUser]);

  const renderSsoCallback = useCallback(() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const dest =
      readPendingClerkRole() === 'artisan'
        ? '/auth?tab=verify'
        : '/';
    return (
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={`${base}${dest}`}
        signUpFallbackRedirectUrl={`${base}${dest}`}
      />
    );
  }, []);

  const getToken = useCallback(async () => {
    if (!isSignedIn || typeof clerkGetToken !== 'function') return null;
    try {
      return (await clerkGetToken()) || null;
    } catch {
      return null;
    }
  }, [isSignedIn, clerkGetToken]);

  const sendEmailCode = useCallback(
    async (emailAddress, role = 'buyer', authMode = 'signin') => {
      const cleaned = String(emailAddress || '').trim().toLowerCase();
      if (!cleaned || !cleaned.includes('@')) {
        throw new Error('Please enter a valid email address.');
      }
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      const normalizedMode = authMode === 'register' || authMode === 'signup' ? 'signup' : 'signin';
      setPendingClerkRole(normalizedRole);
      setPendingClerkAuthMode(normalizedMode);

      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) {
        throw new Error('Authentication service is initializing. Please retry.');
      }

      // 1. Live HunarLink DB check BEFORE calling Clerk:
      //    - Existing DB user/artisan CANNOT register (must log in).
      //    - Non-existent user on Sign In is directed cleanly to Register.
      if (canAttemptBackend()) {
        try {
          const acct = await checkAuthAccount(cleaned);
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
          if (checkErr?.code === 'ALREADY_REGISTERED' || checkErr?.code === 'NOT_REGISTERED') {
            clearPendingClerkRole();
            clearPendingClerkAuthMode();
            throw checkErr;
          }
          // Backend unreachable (static preview): proceed to Clerk
        }
      }

      if (normalizedMode === 'signup') {
        try {
          await signUp.create({ emailAddress: cleaned });
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
    async (code, flow = 'signIn') => {
      const cleaned = String(code || '').trim();
      if (flow === 'signIn') {
        const res = await signIn.attemptFirstFactor({ strategy: 'email_code', code: cleaned });
        if (res.status === 'complete' && res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
          return true;
        }
      } else {
        const res = await signUp.attemptEmailAddressVerification({ code: cleaned });
        if (res.status === 'complete' && res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
          return true;
        }
      }
      throw new Error('Verification incomplete. Please request a fresh code.');
    },
    [clerk, signIn, signUp]
  );

  const bridgeValue = useMemo(
    () => ({
      enabled: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      clerkUser: clerkUser || null,
      getToken,
      authenticateWithOAuth,
      sendEmailCode,
      verifyEmailCode,
      signOutClerk,
      renderSsoCallback
    }),
    [
      isLoaded,
      isSignedIn,
      clerkUser,
      getToken,
      authenticateWithOAuth,
      sendEmailCode,
      verifyEmailCode,
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
      afterSignOutUrl={base}
      routerPush={routerPush}
      routerReplace={routerReplace}
    >
      <ClerkBridgeInner>{children}</ClerkBridgeInner>
    </ClerkProvider>
  );
}
