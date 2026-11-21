import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { canonicalPath } from '../router/legacyMap.js';

/* ==========================================================================
   SpaRedirect
   --------------------------------------------------------------------------
   GitHub Pages cannot rewrite unknown paths, so the root 404.html stores the
   requested route and bounces to the app root. This restores it.

   The stored route is a *requested URL*, which may still be a legacy file path
   (product.html?id=…). It is canonicalised here with the same mapping the
   bootstrap uses, otherwise the router receives a path it has no route for.
   ========================================================================== */
export default function SpaRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const saved = sessionStorage.getItem('hunar_spa_redirect');
    if (!saved) return;
    sessionStorage.removeItem('hunar_spa_redirect');

    // saved looks like "product.html?id=hl-pash-001" or "product?id=…"
    const [pathPart, ...restParts] = saved.split(/(?=[?#])/);
    const query = restParts.join('');
    const withSlash = '/' + pathPart.replace(/^\/+/, '');
    const canonical = canonicalPath(withSlash) ?? withSlash;
    const target = (canonical + query).replace(/\/{2,}/g, '/');

    if (target && target !== '/' && target !== location.pathname + location.search) {
      navigate(target, { replace: true });
    }
  }, [navigate]);

  return null;
}
