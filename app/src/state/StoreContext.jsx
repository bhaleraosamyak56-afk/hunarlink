import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  buildCatalogue,
  cartTotals,
  loadStorage,
  saveStorage,
  pushRecentlyViewed,
  readRecentlyViewed
} from '../utils/legacy.js';

/* ==========================================================================
   Store
   --------------------------------------------------------------------------
   The single owner of application state. Nothing else mutates the DOM, and
   nothing outside this file reads localStorage directly.

   Keys are unchanged from the static build, so a browser that already has a
   cart, a wishlist or an address keeps them.
   ========================================================================== */

const KEYS = {
  cart: 'hunarlink_cart',
  wishlist: 'hunarlink_wishlist',
  savedLater: 'hunarlink_saved_later',
  coupon: 'hunarlink_coupon',
  user: 'hunarlink_auth_user',
  addresses: 'hunarlink_addresses',
  orders: 'hunarlink_orders',
  customProducts: 'hunarlink_custom_products',
  reviews: 'hunarlink_reviews'
};

/* The demo boots as a signed-in collector, exactly as the static build did —
   the header reads "Priya", the avatar reads PS. A visitor who signs out or
   signs in gets their own profile persisted under the same key. */
const DEFAULT_BUYER = {
  name: 'Priya',
  fullName: 'Priya Sharma',
  email: 'priya.sharma@valleycollector.in',
  role: 'buyer',
  title: 'Verified Valley Collector \u2022 J&K',
  badge: 'PS',

  isLoggedIn: true
};

const DEFAULT_ADDRESS = {
  id: 'addr-1',
  name: 'Demo Collector',
  phone: '0000000000',
  line1: 'Houseboat Road, Dal Gate',
  city: 'Srinagar',
  state: 'Jammu & Kashmir',
  pin: '190001'
};

/* Filter defaults, matching the static build's AppState.filters exactly. The
   keys differ on purpose: the static one called search "search", this one
   calls it "query", and both the header and the toolbar write to it. */
const DEFAULT_FILTERS = {
  query: '',
  guild: 'all',
  artisan: '',
  maxPrice: 220000,
  minRating: 0,
  giTier: 0,
  district: 'all',
  sort: 'featured'
};

const initialState = {
  cart: loadStorage(KEYS.cart, []),
  wishlist: loadStorage(KEYS.wishlist, ['hl-kani-004', 'hl-papr-003', 'hl-waln-001']),
  savedLater: loadStorage(KEYS.savedLater, []),
  coupon: loadStorage(KEYS.coupon, null),
  user: loadStorage(KEYS.user, DEFAULT_BUYER),
  addresses: loadStorage(KEYS.addresses, [DEFAULT_ADDRESS]),
  orders: loadStorage(KEYS.orders, []),
  customProducts: loadStorage(KEYS.customProducts, []),
  reviews: loadStorage(KEYS.reviews, {}),
  recentlyViewed: readRecentlyViewed(),
  compareList: [],
  toasts: [],
  ui: {
    drawer: null,           // 'cart' | 'wishlist' | null
    modal: null,            // { type, payload } | null
    filters: DEFAULT_FILTERS,
    loadingProducts: false
  }
};

let toastSeq = 0;

function reducer(state, action) {
  switch (action.type) {
    /* -------------------------------------------------------------- cart */
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
    case 'cart/clear':
      return { ...state, cart: [] };
    case 'cart/saveForLater': {
      if (!state.cart.some((e) => e.productId === action.productId)) return state;
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

    /* ---------------------------------------------------------- wishlist */
    case 'wishlist/toggle': {
      const has = state.wishlist.includes(action.productId);
      return {
        ...state,
        wishlist: has
          ? state.wishlist.filter((id) => id !== action.productId)
          : [...state.wishlist, action.productId]
      };
    }
    case 'wishlist/remove':
      return { ...state, wishlist: state.wishlist.filter((id) => id !== action.productId) };

    /* ------------------------------------------------------------- other */
    case 'coupon/set':
      return { ...state, coupon: action.code };
    case 'user/set':
      return { ...state, user: action.user };
    case 'addresses/set':
      return { ...state, addresses: action.addresses };
    case 'order/add':
      return { ...state, orders: [action.order, ...state.orders] };
    case 'order/advance':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, stage: Math.min(5, (o.stage || 1) + 1) }
            : o
        )
      };
    case 'recentlyViewed/push':
      return { ...state, recentlyViewed: pushRecentlyViewed(action.id) };
    case 'recentlyViewed/clear':
      saveStorage('hunarlink_recently_viewed', []);
      return { ...state, recentlyViewed: [] };
    case 'compare/clear':
      return { ...state, compareList: [] };
    case 'compare/toggle': {
      const has = state.compareList.includes(action.productId);
      return {
        ...state,
        compareList: has
          ? state.compareList.filter((id) => id !== action.productId)
          : [...state.compareList, action.productId].slice(-4)
      };
    }
    case 'reviews/add': {
      const forProduct = state.reviews[action.productId] || [];
      return {
        ...state,
        reviews: { ...state.reviews, [action.productId]: [action.review, ...forProduct] }
      };
    }

    /* ----------------------------------------------------------------- ui */
    case 'ui/drawer':
      return { ...state, ui: { ...state.ui, drawer: action.drawer } };
    case 'ui/modal':
      return {
        ...state,
        ui: { ...state.ui, modal: action.modal ? { type: action.modal, payload: action.payload || {} } : null }
      };
    case 'ui/filters':
      return { ...state, ui: { ...state.ui, filters: { ...state.ui.filters, ...action.patch } } };
    case 'ui/filtersReset':
      return { ...state, ui: { ...state.ui, filters: DEFAULT_FILTERS } };
    case 'ui/loading':
      return { ...state, ui: { ...state.ui, loadingProducts: action.value } };

    /* -------------------------------------------------------------- toast */
    case 'toast/push': {
      toastSeq += 1;
      return { ...state, toasts: [...state.toasts, { id: toastSeq, ...action.toast }] };
    }
    case 'toast/dismiss':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mounted = useRef(false);

  /* The catalogue is derived, not stored — custom products and overrides can
     both change at runtime from the seller portal. */
  const catalogue = useMemo(() => buildCatalogue(state.customProducts), [state.customProducts]);

  const totals = useMemo(
    () => cartTotals(state.cart, catalogue, state.coupon),
    [state.cart, catalogue, state.coupon]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    saveStorage(KEYS.cart, state.cart);
    saveStorage(KEYS.wishlist, state.wishlist);
    saveStorage(KEYS.savedLater, state.savedLater);
    saveStorage(KEYS.coupon, state.coupon);
    saveStorage(KEYS.user, state.user);
    saveStorage(KEYS.addresses, state.addresses);
    saveStorage(KEYS.orders, state.orders);
    saveStorage(KEYS.reviews, state.reviews);
  }, [
    state.cart,
    state.wishlist,
    state.savedLater,
    state.coupon,
    state.user,
    state.addresses,
    state.orders,
    state.reviews
  ]);

  const value = useMemo(() => {
    const productById = (id) => catalogue.find((p) => p.id === id) || catalogue[0];

    const toast = (message, tone = 'default') => {
      dispatch({ type: 'toast/push', toast: { message, tone } });
    };

    return {
      ...state,
      catalogue,
      totals,
      productById,
      cartCount: state.cart.reduce((n, e) => n + e.qty, 0),
      wishlistCount: state.wishlist.length,
      cartItems: state.cart
        .map((e) => ({ ...e, product: productById(e.productId) }))
        .filter((e) => e.product),
      wishlistItems: state.wishlist.map(productById).filter(Boolean),
      savedItems: state.savedLater.map(productById).filter(Boolean),
      recentlyViewedItems: state.recentlyViewed.map(productById).filter(Boolean),
      compareItems: state.compareList.map(productById).filter(Boolean),

      addToCart(productId, qty = 1) {
        dispatch({ type: 'cart/add', productId, qty });
        const p = productById(productId);
        if (p) toast(`Added "${p.title}" to your Acquisition Bag`, 'success');
      },
      setQty: (productId, qty) => dispatch({ type: 'cart/setQty', productId, qty }),
      removeFromCart: (productId) => dispatch({ type: 'cart/remove', productId }),
      clearCart: () => dispatch({ type: 'cart/clear' }),
      saveForLater: (productId) => dispatch({ type: 'cart/saveForLater', productId }),
      moveToCart: (productId) => dispatch({ type: 'cart/moveBack', productId }),

      toggleWishlist(productId) {
        const adding = !state.wishlist.includes(productId);
        dispatch({ type: 'wishlist/toggle', productId });
        const p = productById(productId);
        if (p) {
          toast(
            adding ? `Saved "${p.title}" to Wishlist` : `Removed "${p.title}" from Wishlist`,
            adding ? 'success' : 'default'
          );
        }
      },
      removeFromWishlist: (id) => dispatch({ type: 'wishlist/remove', productId: id }),

      applyCoupon(code) {
        const normalised = String(code || '').trim().toUpperCase();
        const known = ['VALLEY10', 'FIRSTCRAFT'].includes(normalised);
        dispatch({ type: 'coupon/set', code: known ? normalised : null });
        toast(
          known ? `Coupon ${normalised} applied` : `"${normalised}" is not a valid privilege code`,
          known ? 'success' : 'error'
        );
        return known;
      },
      removeCoupon: () => dispatch({ type: 'coupon/set', code: null }),

      addAddress: (address) =>
        dispatch({ type: 'addresses/set', addresses: [...state.addresses, address] }),
      placeOrder: (order) => dispatch({ type: 'order/add', order }),
      addOrder: (order) => dispatch({ type: 'order/add', order }),
      advanceOrder: (orderId) => dispatch({ type: 'order/advance', orderId }),
      addReview: (productId, review) => dispatch({ type: 'reviews/add', productId, review }),
      toggleCompare: (productId) => dispatch({ type: 'compare/toggle', productId }),
      clearCompare: () => dispatch({ type: 'compare/clear' }),

      openDrawer: (drawer) => dispatch({ type: 'ui/drawer', drawer }),
      closeDrawer: () => dispatch({ type: 'ui/drawer', drawer: null }),
      openModal: (modal, payload) => dispatch({ type: 'ui/modal', modal, payload }),
      closeModal: () => dispatch({ type: 'ui/modal', modal: null }),
      setFilters: (patch) => dispatch({ type: 'ui/filters', patch }),
      resetFilters: () => dispatch({ type: 'ui/filtersReset' }),
      setLoadingProducts: (value) => dispatch({ type: 'ui/loading', value }),

      setUser: (user) => {
        dispatch({ type: 'user/set', user });
        toast(user ? `Signed in as ${user.name || user.email}` : 'Signed out');
      },
      pushRecent: (id) => dispatch({ type: 'recentlyViewed/push', id }),
      clearRecentlyViewed: () => dispatch({ type: 'recentlyViewed/clear' }),

      toast,
      dismissToast: (id) => dispatch({ type: 'toast/dismiss', id }),

      /* ---------------------------------------------------------- derived */
      /* Same predicate chain as getFilteredProducts() in the static build,
         so behaviour is identical, including the sort order. */
      filteredProducts: (() => {
        const f = state.ui.filters;
        const q = (f.query || '').trim().toLowerCase();
        let list = catalogue.filter((p) => {
          if (q) {
            const hay = `${p.title} ${p.guildLabel} ${p.artisan} ${p.district} ${p.giId}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          if (f.guild !== 'all' && p.guild !== f.guild) return false;
          if (f.artisan && p.artisan !== f.artisan) return false;
          if (p.price > f.maxPrice) return false;
          if (f.minRating > 0 && p.rating < f.minRating) return false;
          if (f.giTier > 0 && p.giLevel < f.giTier) return false;
          if (f.district !== 'all' && p.district !== f.district) return false;
          return true;
        });
        const s = f.sort;
        if (s === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
        else if (s === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
        else if (s === 'rating-desc') list = [...list].sort((a, b) => b.rating - a.rating);
        else if (s === 'hours-desc') list = [...list].sort((a, b) => b.loomHours - a.loomHours);
        return list;
      })()
    };
  }, [state, catalogue, totals]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>');
  return ctx;
}

export { KEYS };
