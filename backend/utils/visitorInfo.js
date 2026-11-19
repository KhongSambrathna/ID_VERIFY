// Small helpers for the visitor analytics: work out device / OS / browser
// from the User-Agent string, and an approximate location from the IP.
// No extra npm packages — a tiny parser covers the devices people actually
// use here (Android phones, iPhones, Windows/Mac laptops, Facebook/Telegram
// in-app browsers).

function parseUserAgent(ua = "") {
  const s = String(ua);

  let device = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|Opera Mini|IEMobile/i.test(s)) device = "mobile";

  let os = "Other";
  if (/Windows NT/i.test(s)) os = "Windows";
  else if (/Android/i.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/CrOS/i.test(s)) os = "ChromeOS";
  else if (/Linux/i.test(s)) os = "Linux";

  let browser = "Other";
  if (/FBAN|FBAV|FB_IAB/i.test(s)) browser = "Facebook app";
  else if (/Telegram/i.test(s)) browser = "Telegram";
  else if (/Instagram/i.test(s)) browser = "Instagram";
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(s)) browser = "TikTok";
  else if (/Line\//i.test(s)) browser = "LINE";
  else if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung Internet";
  else if (/UCBrowser/i.test(s)) browser = "UC Browser";
  else if (/Firefox|FxiOS/i.test(s)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(s)) browser = "Chrome";
  else if (/Safari/i.test(s)) browser = "Safari";

  return { device, os, browser };
}

function isBot(ua = "") {
  return /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless|curl|wget|python-requests|axios\//i.test(
    String(ua)
  );
}

function clientIp(req) {
  // app.set("trust proxy", true) in server.js makes req.ip the real visitor
  // IP on Render. Strip the IPv4-mapped IPv6 prefix ("::ffff:1.2.3.4").
  let ip = req.ip || req.socket?.remoteAddress || "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

function isPrivateIp(ip) {
  return (
    !ip ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd]/i.test(ip) ||
    /^fe80/i.test(ip)
  );
}

// IP → { country, countryCode, region, city }, cached in memory for a day
// so each visitor is only looked up once. Uses the free ip-api.com service
// (no key; ~45 lookups/minute is plenty for this site). Any failure just
// returns "Unknown" — a missing location must never break page tracking.
const geoCache = new Map();
const GEO_TTL = 24 * 3600 * 1000;

async function lookupGeo(ip) {
  if (isPrivateIp(ip)) return { country: "Local network", countryCode: "", region: "", city: "Local" };
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < GEO_TTL) return cached.data;

  const unknown = { country: "Unknown", countryCode: "", region: "", city: "Unknown" };
  if (typeof fetch !== "function") return unknown;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    const j = await r.json();
    const data =
      j.status === "success"
        ? {
            country: j.country || "Unknown",
            countryCode: j.countryCode || "",
            region: j.regionName || "",
            city: j.city || "Unknown",
          }
        : unknown;
    if (geoCache.size > 5000) geoCache.clear();
    geoCache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return unknown;
  }
}

module.exports = { parseUserAgent, isBot, clientIp, lookupGeo };
