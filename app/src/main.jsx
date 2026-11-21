import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { StoreProvider } from './state/StoreContext.jsx';

import './styles/base.css';
import './styles/craft.css';
import './styles/react-overrides.css';

// The legacy controller attaches a large set of globals (addToCart, toggleDrawer,
// openProductPage ...). Load it once, after the React root exists, so every
// ported component can call the same proven logic while the port proceeds.
import './legacy/hunarlink-controller.js';
import './legacy/pdp-legacy.js';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
);
