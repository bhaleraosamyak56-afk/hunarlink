import React, { useCallback, useMemo } from 'react';
import { ClerkProvider, useUser, useClerk } from '@clerk/react';
import {
  clerkConfig,
  toSessionUser,
  CLERK_ENABLED,
  ClerkAuthContext
} from '../data/clerkConfig.js';

/* ==========================================================================
   ClerkBoundary
   --------------------------------------------------------------------------
   This is the ONLY file in the application that imports @clerk/react.

   Why it is a separate module
   ---------------------------
   A static `import ... from '@clerk/react'` anywhere in the entry graph
   would ship the SDK to every visitor — including the majority who never open
   a login screen and are running the demo with no key configured. So this
   module is reached only through a dynamic import that fires when
   CLERK_ENABLED is true. With no key, Rollup never includes it and no visitor
   ever downloads Clerk code.

   Why the hooks live in a child
   -----------------------------
   useUser() and useClerk() throw when there is no <ClerkProvider> above them.
   Calling them in the same component that renders the provider would run them
   *before* the provider exists. Splitting them into ClerkIdentity, which is
   only ever rendered inside the provider, makes that impossible by
   construction rather than by a conditional that could drift.

   What it publishes
   -----------------
   A context carrying the same shape the app already expects from
   useClerkAuth(): { isLoaded, isSignedIn, user, signOut, enabled }.
   data/clerkConfig.js reads this context and re-exports it, so no page needs
   to know Clerk exists.
   ========================================================================== */

/* The context lives in clerkConfig.js, not here — that module is imported by
   pages that must never pull in the SDK, and this module imports it. Keeping
   the context on the other side of the boundary means the dependency only ever
   points one way: ClerkBoundary -> clerkConfig, never back. The context object
   itself is inert; creating one imports nothing. */

function ClerkIdentity({ children }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();

  const signOut = useCallback(async () => {
    try {
      await clerk.signOut();
    } catch (err) {
      /* Signing out must never leave the UI wedged. If Clerk cannot reach its
         servers the local session is cleared anyway by the caller. */
      // eslint-disable-next-line no-console
      console.warn('[HunarLink] Clerk signOut failed:', err?.message || err);
    }
  }, [clerk]);

  /* Social sign-in.
     ------------------------------------------------------------------------
     OAuth runs in Clerk's hosted flow: the browser leaves the page, the
     provider authenticates the visitor, and Clerk redirects back to the URL
     given here. No password ever passes through this application — which is
     the whole point, because a frontend cannot verify a password and this
     build has no server that could.

     Defaults to the current URL so the visitor returns where they started.
     Errors are returned rather than thrown: the caller shows a toast and the
     demo path stays usable. */
  const signInWith = useCallback(
    async (strategy) => {
      try {
        await clerk.client.signIn.authenticateWithRedirect({
          strategy,
          redirectUrl: window.location.href.split('#')[0],
          redirectUrlComplete: window.location.href.split('#')[0]
        });
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          message: err?.errors?.[0]?.longMessage || err?.message || 'Sign-in could not be started.'
        };
      }
    },
    [clerk]
  );

  /* toSessionUser maps a Clerk user onto this app's session shape — name,
     fullName, email, phone, role, title, badge, isLoggedIn. Kept in
     clerkConfig.js so the mapping is written once and testable on its own. */
  const value = useMemo(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      user: toSessionUser(user),
      rawUser: user || null,
      signOut,
      signInWith,
      enabled: CLERK_ENABLED
    }),
    [isLoaded, isSignedIn, user, signOut, signInWith]
  );

  return <ClerkAuthContext.Provider value={value}>{children}</ClerkAuthContext.Provider>;
}

/**
 * Mounts Clerk with the configured publishable key and provides the session
 * to the tree. Only rendered when clerkConfig.enabled is true.
 */
export default function ClerkBoundary({ children }) {
  if (!CLERK_ENABLED || !clerkConfig.publishableKey) {
    /* Defensive: the caller already checks, but mounting ClerkProvider with a
       missing key throws and would take the whole app down with it. */
    return children;
  }

  return (
    <ClerkProvider
      publishableKey={clerkConfig.publishableKey}
      /* The app owns routing; Clerk must not attempt redirects of its own. */
      routerPush={() => {}}
      routerReplace={() => {}}
    >
      <ClerkIdentity>{children}</ClerkIdentity>
    </ClerkProvider>
  );
}
