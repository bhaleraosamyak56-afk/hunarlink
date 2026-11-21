import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/* ==========================================================================
   LegacyBootstrap
   --------------------------------------------------------------------------
   The ported markup is React; the behaviour behind a great deal of it is still
   the proven legacy controller. That controller wires itself to DOM nodes on
   load, so it has to be re-run after each route paints, otherwise a freshly
   mounted page has markup with no listeners.

   This is the seam that lets the migration land page by page instead of
   requiring a big-bang rewrite. Each component that gets fully ported simply
   stops relying on it.
   ========================================================================== */
export default function LegacyBootstrap() {
  const { pathname, key } = useLocation();

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      // one frame after paint, so the nodes the controller queries exist
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (typeof window.__hunarRebootstrap === 'function') {
          window.__hunarBooted = false;
          try {
            window.__hunarRebootstrap();
          } catch (err) {
            // a missing node on one route must not take the whole app down
            console.warn('[hunar] legacy bootstrap warning:', err && err.message);
          }
        }
        // restore the URL the router owns; the legacy code still rewrites
        // location for a few flows, which would knock the router out of sync
        if (window.__hunarFixUrl) window.__hunarFixUrl();
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [pathname, key]);

  return null;
}
