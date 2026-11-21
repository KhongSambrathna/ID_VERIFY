// Telegram Mini App (Web App) helpers.
//
// The Mini App page (/tg-shop on the website) sends Telegram's `initData`
// string with every request. Telegram signs it with our bot token, so
// checking the signature proves the request really came from that
// Telegram user inside our bot — nobody can fake an order for someone else.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const crypto = require("crypto");

const MAX_AGE_SECONDS = 24 * 3600;

// Returns the Telegram user ({ id, first_name, last_name, username }) or
// null when the data is missing, tampered with, or too old.
function verifyInitData(initData, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(String(initData));
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date")) || 0;
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

// Public https address of the Mini App page.
function miniAppUrl() {
  const base = (process.env.PUBLIC_BASE_URL || "https://id-verify-liart.vercel.app").replace(/\/$/, "");
  return `${base}/tg-shop`;
}

module.exports = { verifyInitData, miniAppUrl };
