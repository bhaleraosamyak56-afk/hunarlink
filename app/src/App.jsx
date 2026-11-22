import React, { Suspense, lazy, useCallback, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useStore } from './state/StoreContext.jsx';
import UtilityBar from './components/UtilityBar.jsx';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import WishlistDrawer from './components/WishlistDrawer.jsx';
import CompareBar from './components/CompareBar.jsx';
import Toasts from './components/Toasts.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import GiVerifyModal from './components/modals/GiVerifyModal.jsx';
import LoginChoiceModal from './components/modals/LoginChoiceModal.jsx';
import CompareModal from './components/modals/CompareModal.jsx';
import CheckoutModal from './components/modals/CheckoutModal.jsx';
import OrdersModal from './components/modals/OrdersModal.jsx';

import HomePage from './pages/HomePage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import WholesalePage from './pages/WholesalePage.jsx';
/* Split points. The storefront, product page and artisan auth are the hot
   path — a visitor lands on one of them and only sometimes clicks onward — so
   those stay in the main bundle. The consoles and the account pages are
   reached by a direct URL or a nav click and nobody lands on them first; they
   carry their own CSS and their own weight, so they load on demand. */
const AdminPage = lazy(() => import('./pages/portal/AdminPage.jsx'));
const SellerPage = lazy(() => import('./pages/portal/SellerPage.jsx'));
const LoginPage = lazy(() => import('./pages/portal/LoginPage.jsx'));
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
import NotFound from './pages/NotFound.jsx';
import SpaRedirect from './pages/SpaRedirect.jsx';
import usePageTitle from './utils/usePageTitle.js';
import LegacyRoutes from './pages/LegacyRoutes.jsx';

/* ==========================================================================
   App
   --------------------------------------------------------------------------
   One router, one header, one footer, and the overlay layer. Every overlay is
   mounted once here and driven by store state — that is the whole difference
   from the previous attempt, where each page rewrote its own DOM underneath a
   React tree that had already rendered it.

   The section nav belongs to the storefront only, so it is suppressed on
   portal pages.
   ========================================================================== */

/* Shown for the frame or two while a split chunk arrives. Deliberately quiet:
   a spinner that flashes for 40 ms reads as a bug, so this is a reserved
   block of the same height the page will occupy. */
function PageFallback() {
  return (
    <main
      className="up-container"
      style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}
      aria-busy="true"
      aria-live="polite"
    >
      <span style={{ color: 'var(--text-500)', fontSize: '0.85rem' }}>Loading\u2026</span>
    </main>
  );
}

export default function App() {
  const { ui } = useStore();
  const [activeSection, setActiveSection] = useState('home');
  const location = useLocation();
  usePageTitle();

  const handleSection = useCallback((id) => setActiveSection(id), []);
  const onStorefront = location.pathname === '/' || location.pathname === '/index.html';

  /* Auth is deliberately chrome-free: the static build rendered it as two
     full-height panes with no header, footer or utility strip, and the pane
     heights are measured against 100dvh. Any chrome here shifts both panes and
     stops the layout matching. */
  const isAuth = /^\/auth(\.html)?$/.test(location.pathname);

  /* The six portal pages ship their own header (and none of them has a footer
     or utility strip), so the storefront chrome must not render there either —
     otherwise the page starts ~77px low and every element below shifts. */
  const isPortal =
    /^\/(profile|orders|login|wholesale|admin|seller)(\.html)?$/.test(location.pathname);

  return (
    <>
      <SpaRedirect />
      <LegacyRoutes />
      {!isAuth && !isPortal && <UtilityBar />}
      {!isAuth && !isPortal && (
        <Header showSectionNav={onStorefront} activeSection={activeSection} />
      )}

      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomePage onSectionChange={handleSection} />} />
        <Route path="/index.html" element={<HomePage onSectionChange={handleSection} />} />
        <Route path="/product" element={<ProductPage />} />
        <Route path="/product.html" element={<ProductPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth.html" element={<AuthPage />} />
        <Route path="/wholesale" element={<WholesalePage />} />
        <Route path="/wholesale.html" element={<WholesalePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin.html" element={<AdminPage />} />
        <Route path="/seller" element={<SellerPage />} />
        <Route path="/seller.html" element={<SellerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login.html" element={<LoginPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders.html" element={<OrdersPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile.html" element={<ProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>

      {!isAuth && !isPortal && <Footer />}

      {/* overlays */}
      <CartDrawer />
      <WishlistDrawer />
      <CompareBar />
      {ui.modal?.type === 'loginChoice' && <LoginChoiceModal />}
      {ui.modal?.type === 'giVerify' && <GiVerifyModal />}
      {ui.modal?.type === 'compare' && <CompareModal />}
      {ui.modal?.type === 'checkout' && <CheckoutModal />}
      {ui.modal?.type === 'orders' && <OrdersModal />}
      <Toasts />
      <ChatWidget />
    </>
  );
}
