// Shared helpers for the search-engine (SEO) functions in this folder.
// These run on Vercel as small serverless functions, next to the website.
export const SITE = "https://id.brathna.com";
export const SITE_NAME = "Countryside Football ID Verify";
// Backend API — the same value the website uses (VITE_API_URL on Vercel).
export const API = (process.env.VITE_API_URL || "https://countryside-football-api.onrender.com").replace(/\/$/, "");

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// fetch with a time limit (the free Render server can be asleep).
export async function getJson(url, ms = 7000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: "application/json" } });
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}
