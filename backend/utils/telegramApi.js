// Small wrapper around the Telegram Bot API (plain HTTPS, built-in fetch).
// Never throws: returns the API's `result`, or null when something failed.
// TELEGRAM_API_BASE is only for tests (a fake Telegram server).
const apiBase = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const hasToken = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

async function tg(method, payload = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) {
      console.warn(`Telegram ${method} failed:`, data ? data.description : res.status);
      return null;
    }
    return data.result;
  } catch (err) {
    console.warn(`Telegram ${method} failed:`, err.message);
    return null;
  }
}

// The bot's @username, looked up once.
let botInfo = null;
async function getBotInfo() {
  if (botInfo) return botInfo;
  const me = await tg("getMe");
  if (me) botInfo = me;
  return botInfo;
}

// Escape text for parse_mode: "HTML".
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = { tg, esc, getBotInfo, hasToken };
