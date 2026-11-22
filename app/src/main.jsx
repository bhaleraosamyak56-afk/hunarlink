import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { StoreProvider } from './state/StoreContext.jsx';

import './styles/base.css';
import './styles/craft.css';
import './styles/widget.css';

/* ==========================================================================
   Entry point
   --------------------------------------------------------------------------
   GitHub Pages serves this from /hunarlink/ (or /hunarlink/react/ during the
   staged rollout), and users reach it through file-style URLs like
   /product.html?id=.... The router basename is therefore derived from the
   document's own path rather than hard-coded, which is the bug that broke the
   previous attempt on /react/index.html.
   ========================================================================== */

function resolveBasename() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const path = window.location.pathname;

  /* BASE_URL already knows which prefix we are served under. If the live path
     starts with it, that prefix is the basename. */
  if (base && path.startsWith(base)) return base;

  /* Otherwise fall back to the directory of the current document, so a copy
     opened from disk or a proxy still routes. */
  const dir = path.replace(/[^/]*$/, '').replace(/\/$/, '');
  return dir || '';
}

const basename = resolveBasename();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
);
