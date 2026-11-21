import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/* GitHub Pages cannot rewrite unknown paths to index.html, so react/404.html
   stores the requested route and bounces to the app root. This restores it. */
export default function SpaRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const saved = sessionStorage.getItem('hunar_spa_redirect');
    if (!saved) return;
    sessionStorage.removeItem('hunar_spa_redirect');
    const target = '/' + saved.replace(/^\/+/, '');
    if (target !== '/' && target !== window.location.pathname) {
      navigate(target, { replace: true });
    }
  }, [navigate]);

  return null;
}
