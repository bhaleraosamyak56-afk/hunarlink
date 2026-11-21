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
  isLoggedIn: true,
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

