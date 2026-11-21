import React from 'react';

/* Converted mechanically from orders.html.
   Review hand-ported handlers marked data-needs-port. */
export default function OrdersPage() {
  return (
    <>
      {/* Shared Top Header */}<header className="up-header"><div className="up-header-inner"><a href="../index.html" className="up-brand"><span className="up-emblem">H</span><div><div className="up-brand-title">HunarLink</div><div className="up-brand-sub">Live Order Tracking</div></div></a><nav className="up-nav-links"><a href="../index.html" className="up-nav-pill">🏠 Storefront</a><a href="profile.html" className="up-nav-pill">👤 My Profile</a><a href="orders.html" className="up-nav-pill active">📦 Track Orders</a><a href="login.html" className="up-nav-pill" id="nav-auth-pill">🔐 User Login</a></nav></div></header>{/* Flipkart-Style Order Tracking Workspace */}<main className="up-container"><div className="orders-layout">{/* Left Filters + Logged-In User Info Card (Like Flipkart Filters) */}<aside className="orders-filter-card"><div style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid var(--border-light)' }}><div style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-500)', marginBottom: '6px' }}>
                  Collector Account
                </div>{/* signed-in identity */}<div id="trk-identity"><div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: '700', color: 'var(--heading-color)' }} id="trk-user-name">Priya Sharma</div><div style={{ fontSize: '0.76rem', color: 'var(--text-700)' }} id="trk-user-contact">priya.sharma@valleycollector.in</div><a href="profile.html" className="btn-link-edit" style={{ display: 'inline-block', paddingLeft: '0', marginTop: '6px' }}>
                    ✏️ Customize Profile →
                  </a></div>{/* signed-out state: never show someone else's name/orders */}<div id="trk-signed-out" style={{ display: 'none' }}><div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: '700', color: 'var(--heading-color)' }}>
                    Not signed in
                  </div><p style={{ fontSize: '0.76rem', color: 'var(--text-700)', lineHeight: '1.5', margin: '6px 0 10px' }}>
                    Sign in to see your own orders and live loom-to-door tracking.
                  </p><a href="login.html" className="btn-orange" style={{ width: '100%', justifyContent: 'center' }}>
                    🔐 Sign in to view orders
                  </a></div></div><h3 style={{ fontSize: '1.15rem', marginBottom: '12px' }}>Filters</h3><div style={{ marginBottom: '16px' }}><div style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-500)', marginBottom: '8px' }}>
                  ORDER STATUS
                </div><label className="gender-radio-label" style={{ display: 'flex', marginBottom: '8px' }}><input type="radio" name="status-filter" value="all" checked onChange={() => { renderOrders(); }} /> All Orders
                </label><label className="gender-radio-label" style={{ display: 'flex', marginBottom: '8px' }}><input type="radio" name="status-filter" value="ontheway" onChange={() => { renderOrders(); }} /> On the Way
                </label><label className="gender-radio-label" style={{ display: 'flex', marginBottom: '8px' }}><input type="radio" name="status-filter" value="delivered" onChange={() => { renderOrders(); }} /> Delivered
                </label></div><button type="button" className="btn-orange-outline" style={{ width: '100%' }} onClick={() => { placeQuickDemoOrder(); }}>
                ⚡ Create Sample Order
              </button></aside>{/* Right Orders List & Live Tracking Cards */}<section><div className="orders-search-bar"><input type="text" id="orders-search-input" className="up-input" placeholder="Search your orders by Order ID, craft title, artisan, or GI ID..." onInput={() => { renderOrders(); }} /><button type="button" className="btn-orange" onClick={() => { renderOrders(); }}>🔍 Search Orders</button></div><div id="orders-list-wrap"></div></section></div></main><div className="up-toast" id="up-toast"></div>
    </>
  );
}
