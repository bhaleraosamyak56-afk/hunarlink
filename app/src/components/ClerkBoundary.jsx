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
import { canAttemptBackend, syncAuthenticatedUser } from '../services/apiClient.js';
import {
  CLERK_PUBLISHABLE_KEY,
  CLERK_ROLE_MAP_KEY,
  ClerkBridgeContext,
  clearPendingClerkRole,
  readClerkArtisanProfile,
  readPendingClerkRole,
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

  /* Sync the Clerk-authenticated user into HunarLink's FastAPI database
     (`users` + `user_role_assignments`) using a cryptographically verified
     Clerk RS256 session JWT, then hydrate catalog, artisans, orders &
     addresses strictly from the live database. */
  const syncUserToBackend = useCallback(
    async (clerkAccount, syncedMeta, requestedRole) => {
      if (!canAttemptBackend() || !clerkAccount?.id || !clerkGetToken) return;
      const syncKey = `${clerkAccount.id}:${requestedRole}`;
      if (lastDbSyncKeyRef.current === syncKey) return;
      const email = syncedMeta.email || '';
      if (!email) return;

      try {
        const token = await clerkGetToken();
        if (!token) return;
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
            requested_role: requestedRole === 'artisan' ? 'artisan' : 'buyer'
          },
          token
        );
        lastDbSyncKeyRef.current = syncKey;
        if (import.meta.env.DEV) {
          console.info(
            `[HunarLink DB] ${res.is_new_user ? 'Created new' : 'Synced'} user ${res.email} (id=${res.user_id}, roles=${res.roles.join(',')})`
          );
        }
        await hydrateFromBackend(token);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(
            `[HunarLink DB] Could not sync Clerk user to FastAPI (${err?.status || 'offline'}): ${err?.message || 'unknown error'}`
          );
        }
      }
    },
    [clerkGetToken, hydrateFromBackend]
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

    const pendingRole = readPendingClerkRole();
    if (pendingRole) clearPendingClerkRole();

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
    syncUserToBackend(clerkUser, synced, resolvedRole);

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
    } else if (pendingRole === 'artisan') {
      /* Guarantee an artisan returning from Google/Apple OAuth NEVER lands on
         the buyer storefront homepage: unverified artisans go to GI/Standard
         verification, while already-verified artisans go straight to /seller. */
      const target = synced.artisanVerified ? '/seller' : '/auth?mode=register&step=verify';
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      const currentPath = (window.location.pathname || '/').replace(new RegExp(`^${base}`), '') || '/';
      if (currentPath === '/' || currentPath === '/index.html' || currentPath === '/login' || currentPath === '/sso-callback') {
        navigate(target, { replace: true });
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
      const ready = useSignUpFlow ? signUpLoaded && signUp : signInLoaded && signIn;
      if (!ready) {
        throw new Error('Clerk is still initialising. Please try again in a moment.');
      }

      const strategy = provider === 'Apple' ? 'oauth_apple' : 'oauth_google';
      const origin = window.location.origin;
      const destPath =
        normalizedRole === 'artisan'
          ? '/auth?mode=register&step=verify'
          : (redirectTo || '/').startsWith('/')
            ? redirectTo || '/'
            : `/${redirectTo}`;
      const redirectUrl = `${origin}${base}/sso-callback`;
      const redirectUrlComplete = `${origin}${base}${destPath}`;

      setPendingClerkRole(normalizedRole);

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
        throw new Error(formatClerkError(err, provider));
      }
    },
    [buyerProfile, clerkUser, isSignedIn, setBuyerProfile, setUser, signIn, signInLoaded, signUp, signUpLoaded, syncUserToBackend]
  );

  const signOutClerk = useCallback(async () => {
    clearPendingClerkRole();
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
        ? '/auth?mode=register&step=verify'
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
    async (emailAddress, role = 'buyer') => {
      const cleaned = String(emailAddress || '').trim().toLowerCase();
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      setPendingClerkRole(normalizedRole);
      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) {
        throw new Error('Authentication service is initializing. Please retry.');
      }
      try {
        const si = await signIn.create({ identifier: cleaned });
        const emailFactor = si.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
        if (!emailFactor) {
          throw new Error('Use "Continue with Google" or "Continue with Apple" for this account.');
        }
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId
        });
        return { flow: 'signIn' };
      } catch (err) {
        const errCode = err?.errors?.[0]?.code;
        if (errCode === 'form_identifier_not_found') {
          await signUp.create({ emailAddress: cleaned });
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          return { flow: 'signUp' };
        }
        throw new Error(
          err?.errors?.[0]?.longMessage ||
            err?.errors?.[0]?.message ||
            err?.message ||
            'Could not send email verification code.'
        );
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
