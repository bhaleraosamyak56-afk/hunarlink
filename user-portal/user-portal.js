/* ==========================================================================
   HunarLink — Shared User Account, Profile & Order Storage Helpers
   Syncs Live Across Storefront, Product Page, Seller Portal & User Portal
   ========================================================================== */

const UP_KEYS = {
  BUYER_PROFILE: "hunarlink_buyer_profile",
  AUTH_USER: "hunarlink_auth_user",
  ADDRESSES: "hunarlink_addresses",
  ORDERS: "hunarlink_orders",
  WISHLIST: "hunarlink_wishlist",
  REVIEWS: "hunarlink_reviews"
};

const DEFAULT_USER_PROFILE = {
  firstName: "Priya",
  lastName: "Sharma",
  fullName: "Priya Sharma",
  email: "priya.sharma@valleycollector.in",
  phone: "+91 98112 77420",
  gender: "Female",
  dob: "1996-05-14",
  bio: "Collector of GI-certified Kashmiri Pashmina, Kani shawls, and hand-carved walnut woodcraft.",
  preferredUpi: "priya.sharma@okaxis",
  preferredPayment: "UPI Verified Escrow",
  avatarColor: "#E05A17",
  avatarPhoto: "",
  badge: "PS",
  role: "buyer",
  /* A visitor who has never signed in is NOT this demo persona. Pages that need
     an identity must check upIsLoggedIn() first, otherwise a brand-new visitor
     is silently shown Priya Sharma's name and order history. */
  isLoggedIn: false,
  memberSince: "Nov 2026"
};

function upLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function upSave(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    upToast("⚠️ Browser storage is full — try a smaller image.");
  }
}

function upGetProfile() {
  const saved = upLoad(UP_KEYS.BUYER_PROFILE, null);
  if (saved) return { ...DEFAULT_USER_PROFILE, ...saved };
  return { ...DEFAULT_USER_PROFILE };
}

/* --------------------------------------------------------------------------
   Session helpers — one source of truth for "is somebody signed in?"
   --------------------------------------------------------------------------
   The buyer profile may exist in storage (so a returning visitor keeps their
   details) while the session itself is closed, so isLoggedIn is the flag that
   matters. An artisan session stored in hunarlink_auth_user does not count as
   a collector login.
   -------------------------------------------------------------------------- */
function upIsLoggedIn() {
  const profile = upLoad(UP_KEYS.BUYER_PROFILE, null);
  if (profile && typeof profile.isLoggedIn === "boolean") {
    return profile.isLoggedIn === true;
  }
  const auth = upLoad(UP_KEYS.AUTH_USER, null);
  if (auth && auth.isLoggedIn && auth.role !== "artisan") return true;
  return false;
}

/* Close the collector session but KEEP the saved profile details, so signing
   back in restores the same person instead of resetting to the demo defaults. */
function upSignOutBuyer() {
  const profile = upLoad(UP_KEYS.BUYER_PROFILE, null);
  if (profile) {
    upSave(UP_KEYS.BUYER_PROFILE, { ...profile, isLoggedIn: false });
  }
  try {
    const auth = upLoad(UP_KEYS.AUTH_USER, null);
    if (auth && auth.role !== "artisan") {
      localStorage.removeItem(UP_KEYS.AUTH_USER);
    }
  } catch (e) { /* storage unavailable — nothing to clear */ }
  if (typeof upToast === "function") upToast("Signed out of your collector account.");
  window.location.href = "login.html";
}

/* The nav pill is a Login link when signed out and a Sign Out action when
   signed in — a "Log in" button sitting next to your own name is dead weight. */
function upRenderNavAuth() {
  const pill = document.getElementById("nav-auth-pill");
  if (!pill) return;

  if (upIsLoggedIn()) {
    pill.textContent = "🚪 Sign Out";
    pill.setAttribute("href", "#");
    pill.setAttribute("role", "button");
    pill.classList.add("up-nav-signout");
    pill.addEventListener("click", function (e) {
      e.preventDefault();
      upSignOutBuyer();
    });
  } else {
    pill.textContent = "🔐 User Login";
    pill.setAttribute("href", "login.html");
    pill.classList.remove("up-nav-signout");
  }
}

function upSaveProfile(profile) {
  const first = (profile.firstName || "Priya").trim();
  const last = (profile.lastName || "").trim();
  const fullName = (first + (last ? " " + last : "")).trim();
  const badge = ((first[0] || "P") + (last[0] || first[1] || "S")).toUpperCase();

  const updated = {
    ...DEFAULT_USER_PROFILE,
    ...profile,
    firstName: first,
    lastName: last,
    fullName,
    badge,
    role: "buyer"
  };

  upSave(UP_KEYS.BUYER_PROFILE, updated);

  // Sync display info to main storefront header if current session isn't an artisan
  const currentAuth = upLoad(UP_KEYS.AUTH_USER, null);
  if (!currentAuth || currentAuth.role !== "artisan") {
    upSave(UP_KEYS.AUTH_USER, {
      name: first,
      fullName,
      email: updated.email,
      phone: updated.phone,
      role: "buyer",
      title: "Verified Valley Collector • J&K",
      badge,
      isLoggedIn: updated.isLoggedIn !== false
    });
  }
  return updated;
}

function upFormatINR(num) {
  return "₹" + Math.round(Number(num) || 0).toLocaleString("en-IN");
}

function upEsc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function upResolveImg(path) {
  if (!path) return "../assets/products/pashmina_01.jpg";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://") || path.startsWith("../")) {
    return path;
  }
  return "../" + path.replace(/^\.?\//, "");
}

function upToast(msg) {
  const el = document.getElementById("up-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(upToast._t);
  upToast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

