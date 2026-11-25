import React, { useCallback, useEffect, useMemo } from 'react';
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
import {
  CLERK_PENDING_ROLE_KEY,
  CLERK_PUBLISHABLE_KEY,
  CLERK_ROLE_MAP_KEY,
  ClerkBridgeContext
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
  if (code === 'dev_browser_unauthenticated') {
    return 'Clerk dev mode requires using the same browser where you are signed into dashboard.clerk.com on http://localhost:5173.';
  }
  if (/not enabled|unsupported|strategy/i.test(msg)) {
    return `${provider} sign-in is not enabled yet in your Clerk Dashboard (User & Authentication -> SSO Connections).`;
  }
  return msg || `Could not start ${provider} sign-in with Clerk.`;
}

function ClerkBridgeInner({ children }) {
  const { isLoaded: userLoaded, isSignedIn, user: clerkUser } = useUser();
  const { isLoaded: authLoaded } = useAuth();
  const clerk = useClerk();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const {
    user: storeUser,
    setUser,
    buyerProfile,
    setBuyerProfile
  } = useStore();

  const isLoaded = Boolean(userLoaded && authLoaded);

  /* Mirror the live Clerk user into StoreContext so Header, ProfilePage,
     OrdersPage and SellerPage all reflect the authenticated session. */
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !clerkUser) {
      if (storeUser && storeUser.authProvider === 'clerk') {
        setUser(null, { silent: true });
      }
      return;
    }

    let pendingRole = null;
    try {
      pendingRole = window.sessionStorage.getItem(CLERK_PENDING_ROLE_KEY);
      if (pendingRole) window.sessionStorage.removeItem(CLERK_PENDING_ROLE_KEY);
    } catch {
      /* ignore */
    }

    const roleMap = readRoleMap();
    const metaRole = clerkUser.publicMetadata?.role;
    const resolvedRole =
      pendingRole ||
      (metaRole === 'artisan' || metaRole === 'buyer' ? metaRole : null) ||
      roleMap[clerkUser.id] ||
      'buyer';

    saveUserRole(clerkUser.id, resolvedRole);

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

    setUser(
      {
        name: first,
        fullName,
        email,
        phone,
        role: resolvedRole,
        title:
          resolvedRole === 'artisan'
            ? 'Verified Artisan \u2022 Clerk SSO'
            : 'Verified Valley Buyer \u2022 Clerk SSO',
        badge,
        avatarPhoto: clerkUser.imageUrl || '',
        clerkUserId: clerkUser.id,
        authProvider: 'clerk',
        isLoggedIn: true
      },
      { silent: true }
    );

    if (resolvedRole === 'buyer') {
      setBuyerProfile({
        ...(buyerProfile || {}),
        firstName: first,
        lastName: last,
        fullName,
        email,
        phone: phone || buyerProfile?.phone || '',
        avatarPhoto: clerkUser.imageUrl || buyerProfile?.avatarPhoto || '',
        badge,
        role: 'buyer',
        isLoggedIn: true
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, clerkUser?.id, clerkUser?.updatedAt]);

  const authenticateWithOAuth = useCallback(
    async (provider, { role = 'user', mode = 'signin', redirectTo = '/profile' } = {}) => {
      const normalizedRole = role === 'artisan' ? 'artisan' : 'buyer';
      const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      const destPath = normalizedRole === 'artisan' ? '/seller' : redirectTo || '/profile';
      const normalizedDest = destPath.startsWith('/') ? destPath : `/${destPath}`;

      /* If already signed in via Clerk, switch HunarLink workspace directly
         rather than letting Clerk throw "You're already signed in". */
      if (isSignedIn && clerkUser) {
        saveUserRole(clerkUser.id, normalizedRole);
        const email = clerkUser.primaryEmailAddress?.emailAddress || '';
        const first = clerkUser.firstName || (email ? email.split('@')[0] : 'Collector');
        const last = clerkUser.lastName || '';
        const fullName = clerkUser.fullName || `${first} ${last}`.trim();
        setUser(
          {
            name: first,
            fullName,
            email,
            phone: clerkUser.primaryPhoneNumber?.phoneNumber || '',
            role: normalizedRole,
            title:
              normalizedRole === 'artisan'
                ? 'Verified Artisan \u2022 Clerk SSO'
                : 'Verified Valley Buyer \u2022 Clerk SSO',
            badge: initialsOf(first, last, email),
            avatarPhoto: clerkUser.imageUrl || '',
            clerkUserId: clerkUser.id,
            authProvider: 'clerk',
            isLoggedIn: true
          },
          { silent: true }
        );
        if (normalizedRole === 'buyer') {
          setBuyerProfile({
            ...(buyerProfile || {}),
            firstName: first,
            lastName: last,
            fullName,
            email,
            phone: clerkUser.primaryPhoneNumber?.phoneNumber || buyerProfile?.phone || '',
            avatarPhoto: clerkUser.imageUrl || buyerProfile?.avatarPhoto || '',
            badge: initialsOf(first, last, email),
            role: 'buyer',
            isLoggedIn: true
          });
        }
        return { alreadySignedIn: true, destination: normalizedDest };
      }

      const useSignUpFlow = mode === 'signup' || mode === 'register';
      const ready = useSignUpFlow ? signUpLoaded && signUp : signInLoaded && signIn;
      if (!ready) {
        throw new Error('Clerk is still initialising. Please try again in a moment.');
      }

      const strategy = provider === 'Apple' ? 'oauth_apple' : 'oauth_google';
      const origin = window.location.origin;
      const redirectUrl = `${origin}${base}/sso-callback`;
      const redirectUrlComplete = `${origin}${base}${normalizedDest}`;

      try {
        window.sessionStorage.setItem(CLERK_PENDING_ROLE_KEY, normalizedRole);
      } catch {
        /* ignore */
      }

      const resource = useSignUpFlow ? signUp : signIn;
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(
            new Error(
              `Clerk did not start the ${provider} redirect in time. Check that ${provider} is enabled in your Clerk Dashboard and that you are running on http://localhost:5173.`
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
        throw new Error(formatClerkError(err, provider));
      }
    },
    [buyerProfile, clerkUser, isSignedIn, setBuyerProfile, setUser, signIn, signInLoaded, signUp, signUpLoaded]
  );

  const signOutClerk = useCallback(async () => {
    try {
      window.sessionStorage.removeItem(CLERK_PENDING_ROLE_KEY);
    } catch {
      /* ignore */
    }
    setUser(null, { silent: true });
    if (isSignedIn && clerk?.signOut) {
      await clerk.signOut(() => {});
    }
  }, [clerk, isSignedIn, setUser]);

  const renderSsoCallback = useCallback(() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    let dest = '/profile';
    try {
      if (window.sessionStorage.getItem(CLERK_PENDING_ROLE_KEY) === 'artisan') {
        dest = '/seller';
      }
    } catch {
      /* ignore */
    }
    return (
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={`${base}${dest}`}
        signUpFallbackRedirectUrl={`${base}${dest}`}
      />
    );
  }, []);

  const bridgeValue = useMemo(
    () => ({
      enabled: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      clerkUser: clerkUser || null,
      authenticateWithOAuth,
      signOutClerk,
      renderSsoCallback
    }),
    [isLoaded, isSignedIn, clerkUser, authenticateWithOAuth, signOutClerk, renderSsoCallback]
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
