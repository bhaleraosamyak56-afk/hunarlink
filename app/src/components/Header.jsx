import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../state/StoreContext.jsx';
import { Heart, Bag, Search, Close } from './Icons.jsx';
import { IconUser } from './LineIcons.jsx';
import { asset } from '../utils/legacy.js';
import { scrollToSection } from '../utils/scrollToSection.js';

/* ==========================================================================
   Header
   --------------------------------------------------------------------------
   The same header the static build ships, rebuilt as components. Search is
   real: it filters the catalogue as you type and offers products, guilds and
   artisans as suggestions, which is what the original did with a global
   render function.
   ========================================================================== */


const NAV = [
  { id: 'home', label: 'Home', to: '/#hero-section', section: 'hero-section' },
  { id: 'artisans', label: 'Our Artisans', to: '/#artisan-showcase-section', section: 'artisan-showcase-section' },
  { id: 'verify', label: 'Valley Verification Flow', to: '/#verification-section', section: 'verification-section' },
  { id: 'store', label: 'J&K Heritage Store', to: '/#marketplace-section', section: 'marketplace-section' },
  { id: 'wholesale', label: 'Wholesale', to: '/#b2b-wholesale-section', section: 'b2b-wholesale-section' }
];

/* Initials are derived from the full name, not read from the stored badge —
   "Priya Sharma" gives PR. A single-word name gives its first two letters
   rather than a lone initial, which read as a broken avatar in a 36px disc. */
function initialsFor(user) {
  const full = (user?.fullName || user?.name || '').trim();
  if (!full) return user?.badge || 'PS';
  const words = full.split(/\s+/).filter(Boolean);
  let out = words.map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  if (out.length === 1) out = words[0].slice(0, 2).toUpperCase();
  return out;
}

export default function Header({ showSectionNav = true, activeSection = 'home' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    cartCount,
    wishlistCount,
    catalogue,
    openDrawer,
    setFilters,
    raiseVeil,
    lowerVeil,
    openModal,
    user
  } = useStore();

  const [query, setQuery] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef(null);
  const wrapRef = useRef(null);

  /* "/" focuses search, Escape clears it — carried over from the static build */
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        setSuggestOpen(false);
        searchRef.current.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const profileMenuRef = useRef(null);
  const profileBtnRef = useRef(null);

  /* close the suggestion panel on an outside click */
  useEffect(() => {
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestOpen(false);
      const menu = profileMenuRef.current;
      const trigger = profileBtnRef.current;
      if (menu && !menu.contains(e.target) && !(trigger && trigger.contains(e.target))) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const term = query.trim().toLowerCase();
  const matches = term
    ? catalogue
        .filter(
          (p) =>
            p.title.toLowerCase().includes(term) ||
            p.artisan.toLowerCase().includes(term) ||
            p.giId.toLowerCase().includes(term) ||
            p.guildLabel.toLowerCase().includes(term)
        )
        .slice(0, 6)
    : [];

  const goHome = () => {
    setFilters({ guild: 'all', query: '' });
    setQuery('');
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goSection = (section) => {
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => scrollToSection(section), 120);
      return;
    }
    scrollToSection(section);
  };

  const commitSearch = (value) => {
    /* A search narrows the catalogue exactly like a filter chip does, so it
       gets the same loading veil even though the control lives up here. */
    raiseVeil(`Searching for \u201c${value}\u201d\u2026`);
    setTimeout(() => lowerVeil(), 900);
    setFilters({ query: value, guild: 'all' });
    setSuggestOpen(false);
    if (location.pathname !== '/') navigate('/');
    setTimeout(() => {
      document.getElementById('marketplace-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 140);
  };

  return (
    <>
      <header className="site-header" id="site-header">
        <div className="container header-inner">
          <button
            type="button"
            className="brand-logo"
            id="brand-home-trigger"
            aria-label="HunarLink — back to the top of the store"
            onClick={goHome}
          >
            <span className="brand-mark" aria-hidden="true">H</span>
            <span className="brand-text-wrap">
              <span className="brand-title">HunarLink</span>
              <span className="brand-subtitle">
                <i className="brand-sub-rule" aria-hidden="true" />
                J&amp;K Artisans Network
              </span>
            </span>
          </button>

          <div className="header-search-wrap" ref={wrapRef}>
            <div className="header-search-box">
              <Search />
              <input
                ref={searchRef}
                type="text"
                id="global-search-input"
                className="header-search-input"
                placeholder="Search craft, artisan, GI ID..."
                aria-label="Search craft, artisan or GI ID"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) commitSearch(query.trim());
                }}
              />
              {!query && (
                <kbd className="search-kbd" aria-hidden="true">
                  /
                </kbd>
              )}
              {query && (
                <button
                  type="button"
                  className="search-clear-btn"
                  aria-label="Clear Search"
                  onClick={() => {
                    setQuery('');
                    setSuggestOpen(false);
                    setFilters({ query: '' });
                  }}
                >
                  <Close size={13} />
                </button>
              )}
            </div>

            {suggestOpen && term && (
              <div className="search-suggestions-dropdown" id="search-suggestions">
                {matches.length === 0 ? (
                  <div className="suggestion-item suggestion-empty">
                    No pieces match &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  matches.map((p) => (
                    <button
                      type="button"
                      className="suggestion-item"
                      key={p.id}
                      onClick={() => {
                        setSuggestOpen(false);
                        setQuery('');
                        navigate(`/product?id=${encodeURIComponent(p.id)}`);
                      }}
                    >
                      <img src={asset(p.image)} alt="" className="suggestion-thumb" />
                      <span>
                        <span className="suggestion-title">{p.title}</span>
                        <span className="suggestion-meta">
                          {p.artisan} &bull; {p.giId}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="header-controls">
            <button
              type="button"
              className="icon-badge-btn"
              id="wishlist-btn"
              aria-label={`Open Wishlist (${wishlistCount} saved)`}
              onClick={() => openDrawer('wishlist')}
            >
              <Heart size={21} />
              <span className="badge-counter" id="wishlist-count">
                {wishlistCount}
              </span>
            </button>

            <button
              type="button"
              className="icon-badge-btn"
              id="cart-btn"
              aria-label={`Open Bag (${cartCount} items)`}
              onClick={() => openDrawer('cart')}
            >
              <Bag size={21} />
              <span className="badge-counter gold" id="cart-count">
                {cartCount}
              </span>
            </button>

            <div className="profile-dropdown-wrap">
              <button
                type="button"
                className="header-account-chip"
                id="account-menu-btn"
                aria-label={`Open account menu for ${user?.name || 'Priya'}`}
                aria-controls="profile-menu"
                aria-expanded={profileOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileOpen((v) => !v);
                }}
              >
                <IconUser size={15} />
                <span>{user?.name || user?.fullName?.split(/\s+/)[0] || 'Priya'}</span>
              </button>

              <button
                type="button"
                className="seller-login-chip"
                id="seller-login-btn"
                aria-label="Seller Login"
                onClick={() => navigate('/auth?mode=login&role=artisan')}
              >
                <svg className="seller-key-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="8" cy="8" r="3.1" />
                  <path d="m10.3 10.3 9.2 9.2m-4.8-4.8 2.2-2.2m1.4 5 2.2-2.2" />
                </svg>
                <span>Seller Login</span>
              </button>

              <button
                type="button"
                className="artisan-studio-btn"
                id="artisan-studio-btn"
                title="Open Artisan Studio"
                onClick={() => navigate('/seller')}
              >
                <span className="artisan-studio-spark" aria-hidden="true">✦</span>
                <span className="artisan-studio-label">ARTISAN STUDIO</span>
              </button>

              <button
                type="button"
                className="profile-avatar-btn"
                id="profile-menu-btn"
                ref={profileBtnRef}
                aria-label="User Profile Menu"
                aria-controls="profile-menu"
                aria-expanded={profileOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileOpen((v) => !v);
                }}
              >
                {initialsFor(user)}
              </button>
              <div className={`profile-menu${profileOpen ? ' open' : ''}`} id="profile-menu" ref={profileMenuRef}>
                <div className="profile-menu-header">
                  <div className="profile-menu-name">
                    {user?.fullName || user?.name || 'Priya Sharma'}
                  </div>
                  <div className="profile-menu-role">
                    {user?.title || 'Verified Valley Buyer \u2022 J&K'}
                  </div>
                </div>
                <button type="button" className="profile-menu-item" onClick={() => { setProfileOpen(false); navigate('/profile'); }}>
                  <span>My Profile (Customize)</span>
                  <span>&rarr;</span>
                </button>
                <button type="button" className="profile-menu-item" onClick={() => { setProfileOpen(false); navigate('/orders'); }}>
                  <span>My Orders &amp; Live Tracking</span>
                  <span>&rarr;</span>
                </button>
                <button type="button" className="profile-menu-item" onClick={() => { setProfileOpen(false); openDrawer('wishlist'); }}>
                  <span>Saved Wishlist</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {showSectionNav && (
        <nav className="section-nav-bar" id="section-nav-bar" aria-label="Section Navigation">
          <div className="container section-nav-track">
            <div className="section-nav-inner">
            {NAV.map((item) => (
              <button
                type="button"
                key={item.id}
                id={`snav-${item.id}`}
                data-target={item.section}
                className={`snav-item${activeSection === item.id ? ' active' : ''}`}
                onClick={() => goSection(item.section)}
              >
                {item.label}
              </button>
            ))}
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
