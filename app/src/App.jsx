import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

import HomePage from './pages/HomePage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import WholesalePage from './pages/WholesalePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import SellerPage from './pages/SellerPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

import LegacyBootstrap from './components/LegacyBootstrap.jsx';
import ChatWidget from './components/ChatWidget.jsx';

export default function App() {
  return (
    <>
      <LegacyBootstrap />
      <ChatWidget />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/product" element={<ProductPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/wholesale" element={<WholesalePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/seller" element={<SellerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
