import { createContext, useCallback, useContext } from 'react';

/* ==========================================================================
   Clerk — wired but inert, and useful even before a key exists
   --------------------------------------------------------------------------
   Is Clerk frontend or backend? Both, and that split is the point of this file.

   FRONTEND (this file): @clerk/react is a React SDK. It renders the
   sign-in UI, holds the session token in the browser and exposes hooks like
   useUser(). Shipping it is purely a client-side concern.

   BACKEND (Clerk's servers): the actual user records, passwords, OAuth
   handshakes, email/SMS delivery and token signing. You never host that. Your
   only job server-side is to *verify* the session token on incoming requests
   with @clerk/backend.

   So "adding Clerk" means two separate jobs, and they are deliberately split
   here because only the first one can be done without a key:

     1. Wire the frontend.            <-- done when you supply VITE_CLERK_PUBLISHABLE_KEY
     2. Verify tokens on a server.    <-- impossible today: there is no server

   The stub is live, not dead code
   -------------------------------
   With no publishable key configured the app cannot talk to Clerk at all, so
   the real sign-in path stays the demo path this project already ships. But
   the shape of the handoff is still exercised: demoLoginsEnabled and
   hasIdentity() behave exactly as they will once a key arrives, which means
   the login page needs no conditional logic of its own. Swap the key and the
   only behaviour that changes is which branch signIn() takes.
   ========================================================================== */

/* Vite exposes any env var prefixed VITE_ on import.meta.env at build time.
   A Clerk publishable key looks like pk_test_… or pk_live_…; it is public by
   design and safe to ship in the bundle. The SECRET key (sk_…) must never
   appear in frontend code — it only belongs on a server. */
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

/* True only when a real key is present. Every branch below keys off this, so
   an unconfigured build behaves exactly like today's build. */
export const CLERK_ENABLED = PUBLISHABLE_KEY.startsWith('pk_');

/* A pk_test_ key belongs to a DEVELOPMENT instance, which Clerk restricts to
   the browser that owns the Clerk dashboard session. Every other visitor —
   a judge, a phone, a stranger — is refused with dev_browser_unauthenticated.
   That is not a bug to route around: it is Clerk's own guard, and opening it
   up would mean defeating a security control.

   Only a PRODUCTION instance (pk_live_) is usable by the public, and that
   requires a domain you own plus your own Google OAuth client. Until then the
   sign-in UI says so up front rather than letting a visitor discover it by
   clicking into a dead end. */
export const CLERK_IS_DEV_INSTANCE = PUBLISHABLE_KEY.startsWith('pk_test_');

export const clerkConfig = {
  enabled: CLERK_ENABLED,
  publishableKey: PUBLISHABLE_KEY || null,
  isDevInstance: CLERK_IS_DEV_INSTANCE,

  /* Demo sign-in must survive a key being added, or a judge evaluating the
     site could no longer get in with the documented demo accounts. Clerk
     governs real identity; the demo accounts are fixture data and stay
     reachable either way. */
  demoLoginsEnabled: true
};

/* A Clerk user reduced to the fields this app actually stores on its session.
   The project's session object (hunarlink_auth_user) wants name, fullName,
   email, phone, role, title, badge, isLoggedIn — so the mapping happens here,
   once, rather than being repeated at every call site. */
export function toSessionUser(clerkUser) {
  if (!clerkUser) return null;
  const first = clerkUser.firstName || '';
  const last = clerkUser.lastName || '';
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ||
    clerkUser.emailAddresses?.[0]?.emailAddress ||
    '';
  const phone = clerkUser.primaryPhoneNumber?.phoneNumber || '';
  const fullName = clerkUser.fullName || `${first} ${last}`.trim() || email;

  return {
    name: first || fullName,
    fullName,
    email,
    phone,
    role: 'buyer',
    title: 'Verified Valley Buyer \u2022 J&K',
    badge: ((first[0] || email[0] || 'H') + (last[0] || email[1] || 'L')).toUpperCase(),
    isLoggedIn: true
  };
}

/* --------------------------------------------------------------------------
   The auth context
   --------------------------------------------------------------------------
   Created here rather than in ClerkBoundary.jsx so the dependency points one
   way only: ClerkBoundary imports this module, and this module imports no
   Clerk code at all. Pages can read the session without the SDK ever entering
   their module graph.

   The value is provided by ClerkBoundary when a key is configured. With no
   key there is no provider, so every consumer reads CLERK_DISABLED_VALUE —
   which is exactly what this app returned before Clerk was wired at all.
   -------------------------------------------------------------------------- */
export const ClerkAuthContext = createContext(null);

export const CLERK_DISABLED_VALUE = Object.freeze({
  isLoaded: true,
  isSignedIn: false,
  user: null,
  rawUser: null,
  signOut: async () => {},
  signInWith: async () => ({ ok: false, message: 'Clerk is not configured.' }),
  enabled: false
});

/* --------------------------------------------------------------------------
   useClerkAuth
   --------------------------------------------------------------------------
   Returns the current Clerk session, or the disabled value when no key is
   configured. The return shape is identical in both cases, which is why the
   login page needs no conditional logic of its own.

   Two deliberate constraints:

   1. This does NOT call useUser() or useClerk(). Those hooks throw outside a
      <ClerkProvider>, and this module is imported by pages that may render
      when no provider exists. The real hooks are called in ClerkBoundary's
      ClerkIdentity, which is only ever rendered inside the provider.
   2. The callback signature stays stable so call sites written against the
      old stub keep working unchanged.
   -------------------------------------------------------------------------- */
export function useClerkAuth() {
  const ctx = useContext(ClerkAuthContext);

  /* signOut is a no-op fallback for the unconfigured case. It is declared
     unconditionally because hooks may not be called conditionally — the
     branch happens on the value, not on the hook. */
  const noopSignOut = useCallback(async () => {}, []);

  if (!ctx) {
    return CLERK_ENABLED
      ? { ...CLERK_DISABLED_VALUE, signOut: noopSignOut, enabled: true }
      : CLERK_DISABLED_VALUE;
  }

  return ctx;
}

/* What a backend would need in order to verify a session token. Recorded so
   the missing half of this integration is written down rather than implied.

     POST /api/session  with header `Authorization: Bearer <token>`
     -> verify with @clerk/backend's verifyToken()
     -> map the Clerk user id to a row in your own users table

   The token is a short-lived JWT signed by Clerk. A frontend alone can
   *claim* a user is signed in, because everything it does is inspectable in
   devtools; only a server can *prove* it. That distinction is exactly why a
   real deployment cannot stop at step 1.
*/
export const SESSION_VERIFICATION_NOTE = true;
