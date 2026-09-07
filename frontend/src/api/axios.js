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

export default api;
