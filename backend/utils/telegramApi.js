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

// Same as tg(), but uploads a file (e.g. a QR code PNG) with multipart form
// data. `file` = { field: "photo", buffer, filename, type }.
async function tgUpload(method, payload = {}, file) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const form = new FormData();
    for (const [k, v] of Object.entries(payload)) {
      if (v === undefined || v === null) continue;
      form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    form.append(file.field, new Blob([file.buffer], { type: file.type || "image/png" }), file.filename || "file.png");
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, { method: "POST", body: form });
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

module.exports = { tg, tgUpload, esc, getBotInfo, hasToken };
