import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { StoreProvider } from './state/StoreContext.jsx';
import { HAS_CLERK } from './data/clerkConfig.js';

import './styles/base.css';
import './styles/craft.css';
import './styles/widget.css';

/* ==========================================================================
   Entry point
   --------------------------------------------------------------------------
   GitHub Pages serves this from /hunarlink/ (or /hunarlink/react/ during the
   staged rollout), while localhost dev serves from /. Clerk is mounted lazily
   only when HAS_CLERK is true (e.g. localhost with VITE_CLERK_PUBLISHABLE_KEY
   in app/.env.local), keeping static GitHub Pages builds completely free of
   the Clerk SDK.
   ========================================================================== */

/* Gate the dynamic import directly on import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
   so Vite dead-code-eliminates ClerkBoundary and @clerk/react completely (0 KB)
   when building for GitHub Pages without a publishable key, while still running
   the runtime HAS_CLERK localhost guard when a key is present. */
const ClerkBoundary =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && HAS_CLERK
    ? lazy(() => import('./components/ClerkBoundary.jsx'))
    : null;

function resolveBasename() {
  if (import.meta.env.BASE_URL === '/') return '';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const path = window.location.pathname;

  if (base && path.startsWith(base)) return base;

  const dir = path.replace(/[^/]*$/, '').replace(/\/$/, '');
  return dir || '';
}

const basename = resolveBasename();

const tree = ClerkBoundary ? (
  <Suspense fallback={null}>
    <ClerkBoundary>
      <App />
    </ClerkBoundary>
  </Suspense>
) : (
  <App />
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      {/* Outermost safety net. This one catches a throw from the provider
          itself (a broken reducer, a corrupt localStorage value read during
          initialisation) — the inner boundary in App.jsx cannot, because it
          sits *inside* the provider. */}
      <ErrorBoundary>
        <StoreProvider>{tree}</StoreProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
