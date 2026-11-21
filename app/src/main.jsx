import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { StoreProvider } from './state/StoreContext.jsx';
import { canonicalPath } from './router/legacyMap.js';

import './styles/base.css';
import './styles/craft.css';
import './styles/pdp.css';
import './styles/auth.css';
import './styles/react-overrides.css';

import './legacy/hunarlink-controller.js';
import './legacy/pdp-legacy.js';

/* ==========================================================================
   Router base
   --------------------------------------------------------------------------
   Vite bakes in "/hunarlink/react/". Using it verbatim as the router basename
   breaks any URL that names a file explicitly — /react/index.html leaves the
   router with "/index.html", which matches no route and renders the 404 page.

   The base is therefore resolved from what the browser actually reports, and
   whenever the request included a filename the URL is rewritten to the clean
   directory form before the router mounts. Visitors land on the same page
   either way, and the address bar ends up tidy.
   ========================================================================== */
function resolveBasename() {
  const baked = import.meta.env.BASE_URL;            // "/hunarlink/react/"
  const base = baked.replace(/\/$/, '');             // "/hunarlink/react"
  const here = location.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '');
  return here.startsWith(base) ? here : base;
}

const basename = resolveBasename();

/* Canonicalise a legacy file-style URL before the router mounts, so an old
   bookmark or a link from the static site keeps working. */
(function normaliseUrl() {
  const clean = canonicalPath(location.pathname);
  if (clean !== null) {
    window.history.replaceState({}, '', clean + location.search + location.hash);
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
    <BrowserRouter basename={basename}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
);
