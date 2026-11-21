/* ==========================================================================
   Legacy URL mapping — one source of truth
   --------------------------------------------------------------------------
   Every page in the original site was a file (index.html, product.html?id=…).
   Ported routes are clean paths. This map is used in two places that must agree:

     1. main.jsx, on first load, to canonicalise the address bar
     2. SpaRedirect, to rewrite a stored route that arrived via the Pages 404

   When they disagreed the normaliser rewrote the URL and SpaRedirect restored
   the stale one, so a legacy link bounced straight back to the 404 page.
   ========================================================================== */
export const LEGACY_MAP = {
  'index.html': '',
  'product.html': 'product',
  'auth.html': 'auth',
  'wholesale.html': 'wholesale',
  'dashboard.html': 'seller',
  'login.html': 'login',
  'orders.html': 'orders',
  'profile.html': 'profile',
  '404.html': ''
};

/* Rewrite a path of the form ".../product.html" to ".../product".
   Returns null when there is nothing to map. */
export function canonicalPath(pathname) {
  const m = pathname.match(/\/([\w-]+\.html)$/);
  if (!m) return null;
  const file = m[1];
  if (!(file in LEGACY_MAP)) return null;
  const dir = pathname.slice(0, pathname.length - file.length);
  return dir + LEGACY_MAP[file];
}
