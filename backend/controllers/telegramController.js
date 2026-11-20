const crypto = require("crypto");
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const { FinanceSettings } = require("../models/Finance");
const { BotOrder, TelegramLink } = require("../models/TelegramBot");
const { tg, getBotInfo, hasToken } = require("../utils/telegramApi");
const bot = require("../bot/shopBot");
const alerts = require("../utils/telegramAlerts");

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
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
async function mySettings(adminId) {
  let st = await FinanceSettings.findOne({ owner: adminId });
  if (!st) st = await FinanceSettings.create({ owner: adminId });
  return st;
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
// server awake and runs the timed alerts)
exports.tick = wrap(async (req, res) => {
  if (req.query.key !== tickKey()) return res.sendStatus(403);
  res.json(await alerts.runScheduled());
});

// GET /api/telegram/public — the bot's @username for the shop page button.
exports.publicInfo = wrap(async (req, res) => {
  const info = hasToken() ? await getBotInfo() : null;
  res.json({ username: info?.username || null });
});

// GET /api/telegram/status (Admin)
exports.status = wrap(async (req, res) => {
  const me = await Admin.findById(req.adminId).select("telegramChatId username").lean();
  const st = await mySettings(req.adminId);
  const out = {
    tokenSet: hasToken(),
    bot: null,
    webhook: { connected: false, url: "", pending: 0, lastError: "" },
    linked: Boolean(me?.telegramChatId),
    chatId: me?.telegramChatId || "",
    alerts: st.alerts,
    tickUrl: hasToken() ? `${publicApiBase(req)}/api/telegram/tick?key=${tickKey()}` : "",
    pendingOrders: await BotOrder.countDocuments({ status: "pending" }),
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
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "ចាប់ផ្ដើម / Start" },
      { command: "shop", description: "មើលទំនិញ / Products" },
      { command: "cart", description: "កន្ត្រក / Cart" },
      { command: "orders", description: "ការកម្មង់របស់ខ្ញុំ / My orders" },
      { command: "contact", description: "ទំនាក់ទំនង / Contact" },
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

// PUT /api/telegram/alerts (Admin) { orders, stock, debts, owed, daily, dailyHour }
exports.updateAlerts = wrap(async (req, res) => {
  const st = await mySettings(req.adminId);
  const a = st.alerts || {};
  for (const k of ["orders", "stock", "debts", "owed", "daily"]) if (req.body[k] !== undefined) a[k] = Boolean(req.body[k]);
  if (req.body.dailyHour !== undefined) {
    const h = Number(req.body.dailyHour);
    if (Number.isInteger(h) && h >= 0 && h <= 23) a.dailyHour = h;
  }
  st.alerts = a;
  st.markModified("alerts");
  await st.save();
  res.json(st.alerts);
});

// POST /api/telegram/test (Admin)
exports.test = wrap(async (req, res) => {
  const me = await Admin.findById(req.adminId).lean();
  if (!me?.telegramChatId) return res.status(400).json({ message: "Link your Telegram first" });
  const ok = await alerts.send(me.telegramChatId, "✅ សាកល្បង — Telegram របស់អ្នកភ្ជាប់ត្រឹមត្រូវ! 🔔");
  if (!ok) return res.status(502).json({ message: "Telegram didn't accept the message" });
  res.json({ ok: true });
});

// POST /api/telegram/run-now (Admin) — run the timed alerts right away.
exports.runNow = wrap(async (req, res) => res.json(await alerts.runScheduled()));

// ---- Bot orders (website) ----
exports.listOrders = wrap(async (req, res) => {
  const filter = {};
  if (["pending", "confirmed", "rejected", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  const list = await BotOrder.find(filter).sort({ createdAt: -1 }).limit(200).populate("invoice", "invoiceNo total paidAmount").lean();
  res.json(list.map(({ adminMessages, ...o }) => o));
});
exports.confirmOrder = wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const r = await bot.confirmOrder(req.params.id, req.adminId);
  if (r.error) return res.status(400).json({ message: r.error });
  res.json({ order: r.order, invoice: { _id: r.invoice._id, invoiceNo: r.invoice.invoiceNo } });
});
exports.rejectOrder = wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const r = await bot.rejectOrder(req.params.id, req.adminId);
  if (r.error) return res.status(400).json({ message: r.error });
  res.json({ order: r.order });
});
