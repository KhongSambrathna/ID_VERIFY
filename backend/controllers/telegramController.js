const crypto = require("crypto");
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const { FinanceSettings } = require("../models/Finance");
const { BotOrder, TelegramLink } = require("../models/TelegramBot");
const { tg, getBotInfo, hasToken } = require("../utils/telegramApi");
const bot = require("../bot/shopBot");
const alerts = require("../utils/telegramAlerts");
const { verifyInitData, miniAppUrl } = require("../utils/telegramWebApp");
const pay = require("../utils/khqrPay");
const payments = require("../utils/orderPayments");

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
  const payChecks = await payments.runPaymentChecks().catch((e) => ({ error: e.message }));
  const feeChecks = await require("../utils/feePayments").runFeeChecks().catch((e) => ({ error: e.message }));
  res.json({ ...(await alerts.runScheduled()), payChecks, feeChecks });
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
    unpaidOrders: await BotOrder.countDocuments({ status: "pending", "payment.status": "unpaid" }),
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
  // The bot's ☰ menu button opens the Mini App shop.
  await tg("setChatMenuButton", {
    menu_button: { type: "web_app", text: "🛍 ហាង", web_app: { url: miniAppUrl() } },
  });
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "ចាប់ផ្ដើម / Start" },
      { command: "shop", description: "មើលទំនិញ / Products" },
      { command: "cart", description: "កន្ត្រក / Cart" },
      { command: "orders", description: "ការកម្មង់របស់ខ្ញុំ / My orders" },
      { command: "contact", description: "ទំនាក់ទំនង / Contact" },
      { command: "account", description: "គណនីរបស់ខ្ញុំ / My account" },
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
// Check one order's KHQR payment now (website button).
exports.checkOrderPayment = wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const order = await BotOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found" });
  const r = await payments.verify(order.orderNo);
  res.json({ message: r.text.replace(/<[^>]+>/g, ""), payment: (await BotOrder.findById(order._id).lean()).payment });
});

// Mark paid by hand (Admin saw the money in the bank app).
exports.markOrderPaid = wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const r = await payments.markPaid(req.params.id, { by: req.adminId });
  if (!r.order) return res.status(404).json({ message: "Order not found" });
  res.json({ already: Boolean(r.already), order: r.order, invoice: r.confirmed ? { _id: r.confirmed._id, invoiceNo: r.confirmed.invoiceNo } : null });
});

// ---- KHQR payment settings (Admin) ----
const payView = (s) => ({
  enabled: s.enabled,
  bakongAccountId: s.bakongAccountId,
  merchantName: s.merchantName,
  merchantCity: s.merchantCity,
  currency: s.currency,
  expiresMinutes: s.expiresMinutes,
  autoConfirm: s.autoConfirm,
  tokenSet: Boolean(s.token),
  tokenHint: s.token ? `…${s.token.slice(-6)}` : "",
  tokenEmail: s.tokenEmail,
  tokenRenewedAt: s.tokenRenewedAt,
  groupChatId: s.groupChatId,
  groupTitle: s.groupTitle,
  lastCheckError: s.lastCheckError,
  lastCheckAt: s.lastCheckAt,
});
exports.getPaySettings = wrap(async (req, res) => res.json(payView(await pay.getSettings())));
exports.updatePaySettings = wrap(async (req, res) => {
  const s = await pay.getSettings();
  const b = req.body || {};
  if (b.bakongAccountId !== undefined) {
    const id = String(b.bakongAccountId || "").trim().toLowerCase();
    if (id && !/^[a-z0-9._-]+@[a-z0-9]+$/.test(id)) return res.status(400).json({ message: "Bakong account ID looks like name@bank (e.g. brathna@aclb)" });
    s.bakongAccountId = id;
  }
  ["merchantName", "merchantCity", "tokenEmail"].forEach((k) => {
    if (b[k] !== undefined) s[k] = String(b[k] || "").trim();
  });
  if (b.merchantName !== undefined && !s.merchantName) return res.status(400).json({ message: "Enter the shop name shown to payers" });
  if (b.currency !== undefined) s.currency = b.currency === "KHR" ? "KHR" : "USD";
  if (b.expiresMinutes !== undefined) {
    const n = Number(b.expiresMinutes);
    if (!Number.isInteger(n) || n < 3 || n > 1440) return res.status(400).json({ message: "QR time: 3–1440 minutes" });
    s.expiresMinutes = n;
  }
  if (b.autoConfirm !== undefined) s.autoConfirm = Boolean(b.autoConfirm);
  if (b.token !== undefined && String(b.token).trim()) {
    s.token = String(b.token).trim();
    s.tokenRenewedAt = new Date();
  }
  if (b.clearGroup) {
    s.groupChatId = "";
    s.groupTitle = "";
  }
  if (b.enabled !== undefined) {
    if (b.enabled && !s.bakongAccountId) return res.status(400).json({ message: "Enter your Bakong account ID first" });
    s.enabled = Boolean(b.enabled);
  }
  // Make sure a QR can actually be made with these details.
  if (s.bakongAccountId) {
    try {
      pay.makeQr(s, { amount: 1, currency: s.currency, billNumber: "TEST" });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }
  await s.save();
  res.json(payView(s));
});

// Test: does the Bakong API answer with this token, and does the account exist?
exports.testPaySettings = wrap(async (req, res) => {
  const s = await pay.getSettings();
  const out = { qr: null, token: null, account: null, error: "" };
  try {
    const q = pay.makeQr(s, { amount: s.currency === "KHR" ? 100 : 0.01, currency: s.currency, billNumber: "TEST" });
    out.qr = q.qr;
  } catch (err) {
    out.error = err.message;
    return res.json(out);
  }
  try {
    out.account = await pay.accountExists(s, s.bakongAccountId);
    out.token = true;
  } catch (err) {
    out.token = false;
    out.error = err.message;
  }
  res.json(out);
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

// ---- Mini App (public; every call proves who it is with Telegram initData) ----

// POST /api/telegram/webapp/session { initData } → saved name/phone
exports.webAppSession = wrap(async (req, res) => {
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ message: "សូមបើកទំព័រនេះពីក្នុង Telegram bot" });
  res.json(await bot.webAppProfile(user));
});

// POST /api/telegram/webapp/order { initData, items: [{id, qty}], name, phone, note }
exports.webAppOrder = wrap(async (req, res) => {
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ message: "សូមបើកទំព័រនេះពីក្នុង Telegram bot" });
  const r = await bot.placeWebAppOrder(user, req.body || {});
  if (r.error) return res.status(400).json({ message: r.error });
  res.json({ id: r.order._id, orderNo: r.order.orderNo, total: r.order.total, payment: webPay(r.order.payment) });
});

// What the Mini App may see of a payment (the QR to show + status).
const webPay = (p) =>
  p && p.status && p.status !== "none"
    ? { status: p.status, qr: p.status === "unpaid" ? p.qr : "", amount: p.amount, currency: p.currency, expiresAt: p.expiresAt, paidAt: p.paidAt }
    : null;

// POST /api/telegram/webapp/payment { initData, orderId, check?, renew? }
// The Mini App polls this while the customer pays.
exports.webAppPayment = wrap(async (req, res) => {
  const user = verifyInitData(req.body?.initData);
  if (!user) return res.status(401).json({ message: "សូមបើកទំព័រនេះពីក្នុង Telegram bot" });
  if (!mongoose.isValidObjectId(req.body?.orderId)) return res.status(400).json({ message: "Invalid order" });
  let order = await BotOrder.findOne({ _id: req.body.orderId, chatId: String(user.id) });
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (req.body.renew && order.status === "pending" && ["expired", "unpaid"].includes(order.payment?.status) && new Date(order.payment.expiresAt) < new Date()) {
    await payments.offerPayment(order);
  } else if (req.body.check && order.payment?.status === "unpaid") {
    // At most one Bakong check per order every 4 s.
    const last = lastWebCheck.get(String(order._id)) || 0;
    if (Date.now() - last > 4000) {
      lastWebCheck.set(String(order._id), Date.now());
      await payments.runPaymentChecks({ orderIds: [order._id] }).catch(() => {});
    }
  }
  order = await BotOrder.findById(order._id).lean();
  res.json({ orderNo: order.orderNo, status: order.status, payment: webPay(order.payment) });
});
const lastWebCheck = new Map();
