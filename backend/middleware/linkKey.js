const crypto = require("crypto");

// Server-to-server key check for the app-link API (/api/link/v1).
//
// Other apps of yours (Tournament, Shop) send:  X-Link-Key: <secret>
// Keys live in the env var LINK_API_KEYS as "app:secret" pairs:
//   LINK_API_KEYS=tournament:7f3c…long-random…,shop:91ab…long-random…
// so each app has its own key and one can be changed without the other.
// req.linkApp = "tournament" | "shop" … (which app is calling).
//
// ពិនិត្យ key សម្ងាត់ សម្រាប់កម្មវិធីផ្សេង (Tournament, Shop) ទាញទិន្នន័យ
function parseKeys() {
  return String(process.env.LINK_API_KEYS || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(":");
      return i > 0 ? { app: p.slice(0, i).trim(), key: p.slice(i + 1).trim() } : null;
    })
    .filter((k) => k && k.key.length >= 16);
}

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = function requireLinkKey(req, res, next) {
  const keys = parseKeys();
  if (!keys.length) return res.status(503).json({ message: "App link is not set up (LINK_API_KEYS)" });
  const given = req.get("x-link-key") || "";
  const hit = given && keys.find((k) => same(k.key, given));
  if (!hit) return res.status(401).json({ message: "Invalid link key" });
  req.linkApp = hit.app;
  next();
};
