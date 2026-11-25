// ID Telegram bot — accounts only (link a website account, reset a password,
// get the site's notices). The shop bot, its orders, the Mini App and KHQR
// settings moved to the shop app.
const crypto = require("crypto");
const Admin = require("../models/Admin");
const { TelegramLink } = require("../models/TelegramBot");
const { tg, getBotInfo, hasToken, esc } = require("../utils/telegramApi");
const bot = require("../bot/idBot");

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The webhook URL carries a secret so nobody else can post fake updates.
function webhookSecret() {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) return process.env.TELEGRAM_WEBHOOK_SECRET;
  return crypto.createHash("sha256").update(`wh:${process.env.TELEGRAM_BOT_TOKEN || ""}`).digest("hex").slice(0, 32);
}
// Same idea for the public "tick" URL used by an outside cron pinger.
function tickKey() {
  return crypto.createHash("sha256").update(`tick:${process.env.TELEGRAM_BOT_TOKEN || ""}`).digest("hex").slice(0, 24);
}
function publicApiBase(req) {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  return `${proto}://${req.get("host")}`;
}

// POST /api/telegram/webhook/:secret  (Telegram → us)
exports.webhook = async (req, res) => {
  if (req.params.secret !== webhookSecret()) return res.sendStatus(403);
  const header = req.get("X-Telegram-Bot-Api-Secret-Token");
  if (header && header !== webhookSecret()) return res.sendStatus(403);
  await bot.handleUpdate(req.body || {});
  res.sendStatus(200);
};

// GET /api/telegram/tick?key=…  (public — an outside cron pinger keeps the
// server awake and checks KHQR fee payments)
exports.tick = wrap(async (req, res) => {
  if (req.query.key !== tickKey()) return res.sendStatus(403);
  const feeChecks = await require("../utils/feePayments").runFeeChecks().catch((e) => ({ error: e.message }));
  res.json({ feeChecks });
});

// GET /api/telegram/public — the bot's @username (for "link Telegram" buttons)
exports.publicInfo = wrap(async (req, res) => {
  const info = hasToken() ? await getBotInfo() : null;
  res.json({ username: info?.username || null });
});

// GET /api/telegram/status (Admin)
exports.status = wrap(async (req, res) => {
  const me = await Admin.findById(req.adminId).select("telegramChatId username").lean();
  const out = {
    tokenSet: hasToken(),
    bot: null,
    webhook: { connected: false, url: "", pending: 0, lastError: "" },
    linked: Boolean(me?.telegramChatId),
    chatId: me?.telegramChatId || "",
    tickUrl: hasToken() ? `${publicApiBase(req)}/api/telegram/tick?key=${tickKey()}` : "",
  };
  if (out.tokenSet) {
    const info = await getBotInfo();
    out.bot = info ? { username: info.username, name: info.first_name } : null;
    const wh = await tg("getWebhookInfo");
    if (wh) {
      out.webhook = {
        connected: Boolean(wh.url) && wh.url.includes(`/api/telegram/webhook/${webhookSecret()}`),
        url: wh.url ? wh.url.replace(webhookSecret(), "••••") : "",
        pending: wh.pending_update_count || 0,
        lastError: wh.last_error_message || "",
      };
    }
  }
  res.json(out);
});

// POST /api/telegram/setup (Admin) — point the bot at this server.
exports.setup = wrap(async (req, res) => {
  if (!hasToken()) return res.status(400).json({ message: "TELEGRAM_BOT_TOKEN is not set on the server" });
  const url = `${publicApiBase(req)}/api/telegram/webhook/${webhookSecret()}`;
  const ok = await tg("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!ok) return res.status(502).json({ message: "Telegram refused the webhook — check the token and that the server URL is https" });
  await tg("setChatMenuButton", { menu_button: { type: "commands" } });
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "ចាប់ផ្ដើម / Start" },
      { command: "account", description: "គណនីរបស់ខ្ញុំ / My account" },
      { command: "help", description: "ជំនួយ / Help" },
    ],
  });
  res.json({ ok: true });
});

// POST /api/telegram/link (Admin) → a one-time t.me link that links my chat.
exports.linkCode = wrap(async (req, res) => {
  const info = await getBotInfo();
  if (!info) return res.status(400).json({ message: "The bot isn't reachable — check TELEGRAM_BOT_TOKEN" });
  const code = crypto.randomBytes(9).toString("hex");
  await TelegramLink.create({ code, admin: req.adminId });
  res.json({ url: `https://t.me/${info.username}?start=link_${code}` });
});

// DELETE /api/telegram/link (Admin)
exports.unlink = wrap(async (req, res) => {
  await Admin.updateOne({ _id: req.adminId }, { $set: { telegramChatId: "" } });
  res.json({ ok: true });
});

// POST /api/telegram/test (Admin)
exports.test = wrap(async (req, res) => {
  const me = await Admin.findById(req.adminId).lean();
  if (!me?.telegramChatId) return res.status(400).json({ message: "Link your Telegram first" });
  const ok = await tg("sendMessage", { chat_id: me.telegramChatId, text: `✅ សាកល្បង — Telegram របស់ ${esc(me.username)} ភ្ជាប់ត្រឹមត្រូវ! 🔔`, parse_mode: "HTML" });
  if (!ok) return res.status(502).json({ message: "Telegram didn't accept the message" });
  res.json({ ok: true });
});
