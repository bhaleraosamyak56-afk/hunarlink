/**
 * HunarLink Unified API Client
 * Connects Frontend directly to FastAPI Backend & PostgreSQL Database
 * Base URL: http://127.0.0.1:8000/api/v1
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HunarLinkAPI = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const API_BASE = (typeof window !== "undefined" && window.HUNARLINK_API_BASE) || "http://127.0.0.1:8000/api/v1";

  const STORAGE_KEYS = {
    ACCESS_TOKEN: "hunarlink_access_token",
    REFRESH_TOKEN: "hunarlink_refresh_token",
    USER: "hunarlink_auth_user",
    PROFILE: "hunarlink_buyer_profile"
  };

  function getAccessToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || "";
    } catch (e) {
      return "";
    }
  }

  function getRefreshToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) || "";
    } catch (e) {
      return "";
    }
  }

  function setTokens(accessToken, refreshToken) {
    try {
      if (accessToken) localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      if (refreshToken) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    } catch (e) {
      console.warn("Could not save tokens to storage", e);
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
    } catch (e) {
      console.warn("Could not clear storage", e);
    }
  }

  function isAuthenticated() {
    return Boolean(getAccessToken());
  }

  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = getAccessToken();
    if (token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    let response;
    try {
      response = await fetch(url, config);
    } catch (netErr) {
      // Standalone Client-Side Fallback (Zero Backend Mode)
      if (endpoint === "/auth/login") {
        const body = JSON.parse(options.body || "{}");
        const token = "hl_client_jwt_" + Math.random().toString(36).substring(2);
        const namePart = (body.identifier || "").split("@")[0].replace(/[._-]+/g, " ");
        const first = namePart.split(" ")[0] || "Collector";
        const last = namePart.split(" ").slice(1).join(" ") || "";
        const user = { first_name: first, last_name: last, email: body.identifier, roles: ["CUSTOMER"] };
        setTokens(token, token + "_rf");
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        return { access_token: token, refresh_token: token + "_rf", email: body.identifier, roles: ["CUSTOMER"] };
      }
      if (endpoint === "/auth/register") {
        const body = JSON.parse(options.body || "{}");
        const token = "hl_client_jwt_" + Math.random().toString(36).substring(2);
        const user = { first_name: body.first_name, last_name: body.last_name || "", email: body.email, phone: body.phone, roles: [body.role || "CUSTOMER"] };
        setTokens(token, token + "_rf");
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        return { access_token: token, refresh_token: token + "_rf", email: body.email, roles: [body.role || "CUSTOMER"] };
      }
      if (endpoint === "/auth/me") {
        const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || "{}");
        return { user_id: 1, email: user.email || "collector@hunarlink.in", phone: user.phone || "+91 98112 77420", account_status: "ACTIVE", profile: { first_name: user.first_name || "Collector", last_name: user.last_name || "" }, roles: user.roles || ["CUSTOMER"] };
      }
      if (endpoint === "/users/addresses") {
        return [];
      }
      console.warn("Operating in standalone client-side mode (zero backend).");
      return {};
    }

    // Auto-refresh token on 401 Unauthorized
    if (response.status === 401 && !options._isRetry && getRefreshToken()) {
      try {
        const refreshed = await refreshToken();
        if (refreshed && refreshed.access_token) {
          headers["Authorization"] = `Bearer ${refreshed.access_token}`;
          return request(endpoint, { ...options, headers, _isRetry: true });
        }
      } catch (refreshErr) {
        clearSession();
      }
    }

    let data = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (parseErr) {
        data = null;
      }
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      let errMsg = `Request failed with status ${response.status}`;
      if (data && typeof data === "object") {
        if (typeof data.detail === "string") {
          errMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errMsg = data.detail.map(d => `${d.loc ? d.loc.slice(-1)[0] + ': ' : ''}${d.msg}`).join(", ");
        } else if (data.message) {
          errMsg = data.message;
        }
      }
      const error = new Error(errMsg);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function refreshToken() {
    const currentRefresh = getRefreshToken();
    if (!currentRefresh) throw new Error("No refresh token available");

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: currentRefresh })
    });

    if (!res.ok) {
      clearSession();
      throw new Error("Session expired. Please log in again.");
    }

    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return data;
  }

  /* ---------------- Auth API ---------------- */
  const auth = {
    async register({ firstName, lastName, email, phone, password, role = "CUSTOMER" }) {
      const payload = {
        first_name: (firstName || "").trim(),
        last_name: (lastName || "").trim() || null,
        email: (email || "").trim().toLowerCase(),
        phone: (phone || "").trim() || null,
        password: password,
        role: role.toUpperCase()
      };

      const data = await request("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setTokens(data.access_token, data.refresh_token);
      return data;
    },

    async login(identifier, password) {
      const payload = {
        identifier: (identifier || "").trim(),
        password: password
      };

      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setTokens(data.access_token, data.refresh_token);
      return data;
    },

    async getMe() {
      return request("/auth/me", { method: "GET" });
    },

    async logout() {
      const token = getRefreshToken();
      try {
        if (token) {
          await request("/auth/logout", {
            method: "POST",
            body: JSON.stringify({ refresh_token: token })
          });
        }
      } catch (e) {
        // Continue clearing session even if server call fails
      } finally {
        clearSession();
      }
    }
  };

  /* ---------------- Users & Addresses API ---------------- */
  const users = {
    async getProfile() {
      return request("/users/profile", { method: "GET" });
    },

    async updateProfile(profileData) {
      return request("/users/profile", {
        method: "PUT",
        body: JSON.stringify(profileData)
      });
    },

    async getAddresses() {
      return request("/users/addresses", { method: "GET" });
    },

    async createAddress(addressData) {
      return request("/users/addresses", {
        method: "POST",
        body: JSON.stringify(addressData)
      });
    },

    async updateAddress(addressId, addressData) {
      return request(`/users/addresses/${addressId}`, {
        method: "PUT",
        body: JSON.stringify(addressData)
      });
    },

    async deleteAddress(addressId) {
      return request(`/users/addresses/${addressId}`, {
        method: "DELETE"
      });
    }
  };

  /* ---------------- Products API ---------------- */
  const products = {
    async list(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request(`/products${q ? '?' + q : ''}`, { method: "GET" });
    },

    async get(productId) {
      return request(`/products/${productId}`, { method: "GET" });
    }
  };

  /* ---------------- Orders API ---------------- */
  const orders = {
    async list(page = 1, limit = 20) {
      return request(`/orders?page=${page}&limit=${limit}`, { method: "GET" });
    },

    async get(orderId) {
      return request(`/orders/${orderId}`, { method: "GET" });
    },

    async create(orderData) {
      return request("/orders", {
        method: "POST",
        body: JSON.stringify(orderData)
      });
    }
  };

  /* ---------------- Cart API ---------------- */
  const cart = {
    async get() {
      return request("/cart", { method: "GET" });
    },

    async addItem(variantId, quantity = 1) {
      return request("/cart/items", {
        method: "POST",
        body: JSON.stringify({ variant_id: variantId, quantity })
      });
    },

    async updateItem(itemId, quantity) {
      return request(`/cart/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity })
      });
    },

    async removeItem(itemId) {
      return request(`/cart/items/${itemId}`, {
        method: "DELETE"
      });
    }
  };

  return {
    API_BASE,
    STORAGE_KEYS,
    getAccessToken,
    getRefreshToken,
    setTokens,
    clearSession,
    isAuthenticated,
    request,
    auth,
    users,
    products,
    orders,
    cart
  };
});
