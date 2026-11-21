import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

/* ==========================================================================
   StoreContext
   --------------------------------------------------------------------------
   A single source of truth for the parts of the app that more than one
   component renders: cart, wishlist, saved-later, the applied coupon and the
   signed-in user. Persistence deliberately mirrors the legacy adapter, so the
   same localStorage keys keep working and a browser that already has data is
   picked up unchanged.

   The legacy controller still owns the heavier flows (checkout wizard, GI
   verification) — this context wraps it, it does not replace it yet.
   ========================================================================== */

const KEYS = {
  cart: 'hunarlink_cart',
  wishlist: 'hunarlink_wishlist',
  savedLater: 'hunarlink_saved_later',
  coupon: 'hunarlink_coupon',
  user: 'hunarlink_auth_user'
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

const initialState = {
  cart: read(KEYS.cart, []),
  wishlist: read(KEYS.wishlist, ['hl-kani-004', 'hl-papr-003', 'hl-waln-001']),
  savedLater: read(KEYS.savedLater, []),
  coupon: read(KEYS.coupon, null),
  user: read(KEYS.user, null)
};

function reducer(state, action) {
  switch (action.type) {
    case 'cart/add': {
      const { productId, qty = 1 } = action;
      const existing = state.cart.find((e) => e.productId === productId);
      const cart = existing
        ? state.cart.map((e) =>
            e.productId === productId ? { ...e, qty: Math.min(e.qty + qty, 10) } : e
          )
        : [...state.cart, { productId, qty }];
      return { ...state, cart };
    }
    case 'cart/setQty': {
      const cart = state.cart
        .map((e) => (e.productId === action.productId ? { ...e, qty: action.qty } : e))
        .filter((e) => e.qty > 0);
      return { ...state, cart };
    }
    case 'cart/remove':
      return { ...state, cart: state.cart.filter((e) => e.productId !== action.productId) };
    case 'cart/saveForLater': {
      const entry = state.cart.find((e) => e.productId === action.productId);
      if (!entry) return state;
      return {
        ...state,
        cart: state.cart.filter((e) => e.productId !== action.productId),
        savedLater: state.savedLater.includes(action.productId)
          ? state.savedLater
          : [...state.savedLater, action.productId]
      };
    }
    case 'cart/moveBack': {
      const exists = state.cart.find((e) => e.productId === action.productId);
      return {
        ...state,
        savedLater: state.savedLater.filter((id) => id !== action.productId),
        cart: exists
          ? state.cart.map((e) =>
              e.productId === action.productId ? { ...e, qty: e.qty + 1 } : e
            )
          : [...state.cart, { productId: action.productId, qty: 1 }]
      };
    }
    case 'wishlist/toggle': {
      const has = state.wishlist.includes(action.productId);
      return {
        ...state,
        wishlist: has
          ? state.wishlist.filter((id) => id !== action.productId)
          : [...state.wishlist, action.productId]
      };
    }
    case 'coupon/set':
      return { ...state, coupon: action.code };
    case 'user/set':
      return { ...state, user: action.user };
    case 'hydrate':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const first = useRef(true);

  /* Persist on change, but not on the very first render. */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    write(KEYS.cart, state.cart);
    write(KEYS.wishlist, state.wishlist);
    write(KEYS.savedLater, state.savedLater);
    write(KEYS.coupon, state.coupon);
    write(KEYS.user, state.user);
  }, [state.cart, state.wishlist, state.savedLater, state.coupon, state.user]);

  /* Re-sync if the legacy controller changed storage underneath us
     (it still owns some flows during the port). */
  useEffect(() => {
    const sync = () => {
      const next = {
        cart: read(KEYS.cart, []),
        wishlist: read(KEYS.wishlist, []),
        savedLater: read(KEYS.savedLater, []),
        coupon: read(KEYS.coupon, null)
      };
      dispatch({ type: 'hydrate', payload: next });
    };
    window.addEventListener('hunarlink:storage', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('hunarlink:storage', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const value = useMemo(() => {
    const cartCount = state.cart.reduce((n, e) => n + e.qty, 0);
    return {
      ...state,
      cartCount,
      wishlistCount: state.wishlist.length,
      addToCart: (productId, qty = 1) => {
        dispatch({ type: 'cart/add', productId, qty });
        if (window.showToast && window.getProductById) {
          const p = window.getProductById(productId);
          if (p) window.showToast(`Added "${p.title}" to your Acquisition Bag`);
        }
      },
      setQty: (productId, qty) => dispatch({ type: 'cart/setQty', productId, qty }),
      removeFromCart: (productId) => dispatch({ type: 'cart/remove', productId }),
      saveForLater: (productId) => dispatch({ type: 'cart/saveForLater', productId }),
      moveToCart: (productId) => dispatch({ type: 'cart/moveBack', productId }),
      toggleWishlist: (productId) => {
        dispatch({ type: 'wishlist/toggle', productId });
        window.dispatchEvent(new CustomEvent('hunarlink:storage'));
      },
      setCoupon: (code) => dispatch({ type: 'coupon/set', code }),
      setUser: (user) => dispatch({ type: 'user/set', user })
    };
  }, [state]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
