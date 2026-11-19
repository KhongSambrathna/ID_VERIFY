import axios from "axios";

// In production, set VITE_API_URL in your hosting platform's environment
// variables to your deployed backend URL, e.g. https://your-app.onrender.com
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: `${API_BASE}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Stay signed in: the backend sends a renewed token in X-Refresh-Token
// while the app is in use (see backend/middleware/auth.js) — save it so the
// login never runs out for anyone who keeps using the app.
// If a token has really expired (unused for months) or is invalid, clear it
// and go to the login page once, instead of leaving every page showing
// "Invalid or expired token" errors.
api.interceptors.response.use(
  (res) => {
    const fresh = res.headers?.["x-refresh-token"];
    if (fresh) {
      try {
        localStorage.setItem("token", fresh);
      } catch {
        /* storage unavailable — keep using the current token */
      }
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 401 && err.response?.data?.code === "TOKEN_EXPIRED") {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      } catch {
        /* ignore */
      }
      if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
    }
    return Promise.reject(err);
  }
);

export default api;
