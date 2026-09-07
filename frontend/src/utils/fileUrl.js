const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/**
 * Resolves a stored file path/URL to something an <img>/<a> can use.
 * - Cloudinary URLs (and any other absolute URL) are returned as-is.
 * - Older records saved before the Cloudinary migration store a relative
 *   path like "/uploads/xyz.jpg" — those still get the API base prepended
 *   so old data doesn't break, though the file itself may no longer exist
 *   if it was on a host with ephemeral disk (e.g. Render free tier).
 */
export function resolveFileUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${API_BASE}${pathOrUrl}`;
}
