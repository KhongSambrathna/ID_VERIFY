// Private Telegram alerts for the Admin (shop owner).
//
// Each Admin chooses their alerts on the "Telegram bot" page; they're stored
// on their own finance settings (FinanceSettings.alerts) and sent ONLY to
// that Admin's own linked chat — never to other Admins or coaches:
//   orders — a new order from the shop bot (with ✅ / ❌ buttons)
//   stock  — a product is running low / ran out
//   debts  — a debt payment is due tomorrow; auto-pay marked a month paid
//   owed   — every Monday: who owes me money
//   daily  — every evening: today's sales, income, expenses, money now
//
// Timed alerts (debts / owed / daily) run from runScheduled(), called every
// 10 minutes by server.js and by GET /api/telegram/tick (for an outside
// cron pinger, because a free Render server sleeps when nobody visits).
const Admin = require("../models/Admin");
const Product = require("../models/Product");
const Invoice = require("../models/Invoice");
const StockMovement = require("../models/StockMovement");
const { FinanceSettings, FinanceDebt, FinanceTxn } = require("../models/Finance");
const { BotOrder, AlertLog } = require("../models/TelegramBot");
const { tg, esc } = require("./telegramApi");

const TZ = "Asia/Phnom_Penh";
const RATE = 4000;
const usd = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
const khr = (n) => `៛${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const approx = (n) => `≈ ៛${(Math.round(((Number(n) || 0) * RATE) / 100) * 100).toLocaleString("en-US")}`;
const debtMoney = (n, cur) => (cur === "KHR" ? khr(n) : usd(n));

// Phnom Penh clock parts for a moment.
function pp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday, day: Number(parts.day) };
}
const dmy = (ymd) => ymd.split("-").reverse().join("/");
const dayStart = (ymd) => new Date(`${ymd}T00:00:00+07:00`);

// Send once per key. Returns true if this call claimed the key.
async function once(key, ttlDays) {
  try {
    await AlertLog.create({ key, expiresAt: ttlDays ? new Date(Date.now() + ttlDays * 86400000) : null });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // already sent
    throw err;
  }
}

// Admins (role ADMIN, Telegram linked) who turned this alert on.
async function recipients(kind) {
  const sts = await FinanceSettings.find({ [`alerts.${kind}`]: true }).select("owner alerts").lean();
  if (!sts.length) return [];
  const admins = await Admin.find({ _id: { $in: sts.map((s) => s.owner) }, role: "ADMIN", telegramChatId: { $nin: ["", null] } })
    .select("username telegramChatId")
    .lean();
  return admins.map((a) => ({ ...a, alerts: sts.find((s) => String(s.owner) === String(a._id)).alerts }));
}

const send = (chatId, text, extra = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

function webLink(path) {
  const base = process.env.FRONTEND_URL;
  return base ? `${base.replace(/\/$/, "")}${path}` : null;
}

// ---------------- Instant alerts ----------------

async function alertNewOrder(order) {
  const to = await recipients("orders");
  if (!to.length) return;
  let text = `🛒 <b>ការកម្មង់ថ្មី ${order.orderNo}</b> (Telegram)\n\n`;
  order.items.forEach((i, n) => (text += `${n + 1}. ${esc(i.name)} — ${i.qty} × ${usd(i.unitPrice)} = ${usd(i.qty * i.unitPrice)}\n`));
  text += `\n💰 សរុប <b>${usd(order.total)}</b> (${approx(order.total)})\n👤 ${esc(order.customer.name)}${order.username ? ` (@${esc(order.username)})` : ""}\n📱 ${esc(order.customer.phone)}`;
  if (order.note) text += `\n📝 ${esc(order.note)}`;
  const ps = order.payment?.status;
  if (ps === "unpaid") text += `\n\n💳 បានផ្ញើ KHQR ឲ្យអតិថិជន — រង់ចាំការបង់ (ផ្ទៀងផ្ទាត់ស្វ័យប្រវត្តិ)`;
  if (ps === "paid") text += `\n\n✅ បានបង់រួច`;
  const rows = [[
    { text: "✅ យល់ព្រម → វិក្កយបត្រ", callback_data: `bo:y:${order._id}` },
    { text: "❌ បដិសេធ", callback_data: `bo:n:${order._id}` },
  ]];
  if (ps === "unpaid" || ps === "none" || !ps) {
    rows.push([
      ...(ps === "unpaid" ? [{ text: "💳 ពិនិត្យការបង់", callback_data: `pv:${order._id}` }] : []),
      { text: "💰 បានទទួលលុយ (ដៃ)", callback_data: `pm:${order._id}` },
    ]);
  }
  if (order.username) rows.push([{ text: `💬 ឆាតជាមួយ @${order.username}`, url: `https://t.me/${order.username}` }]);
  const link = webLink("/admin/telegram?tab=orders");
  if (link) rows.push([{ text: "🌐 មើលលើវេបសាយ", url: link }]);
  for (const a of to) {
    const m = await send(a.telegramChatId, text, { reply_markup: { inline_keyboard: rows } });
    if (m) order.adminMessages.push({ chatId: String(a.telegramChatId), messageId: m.message_id });
  }
  await order.save();
}

// Call after stock goes down (sale, invoice, stock-out) or up (restock).
async function stockChanged(productIds) {
  try {
    const ids = [...new Set((productIds || []).map(String))];
    if (!ids.length) return;
    const products = await Product.find({ _id: { $in: ids } }).select("name stock unit lowStockAlert").lean();
    let to = null;
    for (const p of products) {
      const limit = p.lowStockAlert ?? 5;
      if (p.stock > limit) {
        // back in stock → allow the alert again next time it runs low
        await AlertLog.deleteMany({ key: { $in: [`stock:${p._id}:low`, `stock:${p._id}:out`] } });
        continue;
      }
      const level = p.stock <= 0 ? "out" : "low";
      if (!(await once(`stock:${p._id}:${level}`))) continue;
      if (level === "out") await AlertLog.deleteOne({ key: `stock:${p._id}:low` });
      to = to || (await recipients("stock"));
      const text =
        level === "out"
          ? `🚫 <b>${esc(p.name)}</b> អស់ស្តុកហើយ! (លែងបង្ហាញលើហាង និង bot)`
          : `⚠️ <b>${esc(p.name)}</b> ជិតអស់ស្តុក — នៅសល់ ${p.stock} ${esc(p.unit || "pcs")}`;
      for (const a of to) await send(a.telegramChatId, `${text}\n📦 សូមទិញចូលបន្ថែម`);
    }
  } catch (err) {
    console.warn("stock alert failed:", err.message);
  }
}

async function alertAutoPaid(ownerId, d, payment) {
  const [a] = (await recipients("debts")).filter((x) => String(x._id) === String(ownerId));
  if (!a) return;
  const d8 = pp(new Date(payment.date)).ymd;
  await send(
    a.telegramChatId,
    `🤖 <b>កត់ថាបានបង់ហើយ</b> (ផុតថ្ងៃបង់ ${dmy(d8)})\n💳 ${esc(d.party)}: ${debtMoney(payment.amount, d.currency)}` +
      (payment.interest > 0 ? ` (ការប្រាក់ ${debtMoney(payment.interest, d.currency)})` : "") +
      `\nនៅជំពាក់: <b>${debtMoney(d.remaining, d.currency)}</b>\n\nបើមិនទាន់បានបង់ពិតប្រាកដ សូមលុបវានៅក្នុងប្រវត្តិសង។`
  );
}

// ---------------- Timed alerts ----------------

async function debtReminders(a, now) {
  const { helpers } = require("../controllers/financeController");
  const req = { adminId: a._id };
  await helpers.syncAutoPayments(req); // may send "auto-paid" alerts
  const t = pp(now);
  if (t.hour < 8) return;
  const tomorrow = pp(new Date(now.getTime() + 86400000));
  const tomorrowKey = tomorrow.ymd.slice(0, 7);
  const debts = await FinanceDebt.find({ owner: a._id, direction: "owe", closed: false });
  for (const doc of debts) {
    const d = helpers.debtView(doc);
    if (d.paymentDay > 0 && d.repayType !== "flexible" && d.monthlyDue > 0) {
      const due = helpers.dueInMonth(tomorrowKey, d.paymentDay);
      if (pp(due).ymd === tomorrow.ymd && (await once(`debt:${d._id}:${tomorrow.ymd}`, 5))) {
        await send(
          a.telegramChatId,
          `⏰ <b>ថ្ងៃស្អែក (${dmy(tomorrow.ymd)}) ត្រូវសងបំណុល</b>\n💳 ${esc(d.party)}: <b>${debtMoney(d.monthlyDue, d.currency)}</b>` +
            (d.repayType === "interest_only" ? " (ការប្រាក់)" : "") +
            (d.autoPay ? "\n🤖 ផុតថ្ងៃនោះ នឹងកត់ថាបានបង់ដោយស្វ័យប្រវត្តិ" : "")
        );
      }
    }
    if (d.dueDate && d.remaining > 0) {
      const days = Math.round((dayStart(pp(new Date(d.dueDate)).ymd) - dayStart(t.ymd)) / 86400000);
      for (const mark of [30, 7, 1]) {
        if (days === mark && (await once(`due:${d._id}:${mark}`, 60))) {
          await send(
            a.telegramChatId,
            `📅 <b>នៅសល់ ${mark} ថ្ងៃ</b> ដល់ថ្ងៃផុតកំណត់បំណុល ${esc(d.party)} (${dmy(pp(new Date(d.dueDate)).ymd)})\nត្រូវសងដើមដែលនៅសល់: <b>${debtMoney(d.remaining, d.currency)}</b>`
          );
        }
      }
    }
  }
}

async function weeklyOwed(a, now) {
  const t = pp(now);
  if (t.weekday !== "Mon" || t.hour < 8) return;
  if (!(await once(`owed:${a._id}:${t.ymd}`, 10))) return;
  const { helpers } = require("../controllers/financeController");
  const r = await helpers.computeReceivables({ adminId: a._id });
  let text = `🤝 <b>អ្នកជំពាក់ខ្ញុំ — សង្ខេបប្រចាំសប្ដាហ៍</b>\n\n💰 សរុប <b>${usd(r.totals.allUSD)}</b> (${approx(r.totals.allUSD)})\n`;
  text += `🎓 សិស្ស: ${khr(r.totals.studentsKHR)} (${usd(r.totals.studentsUSD)}) · ${r.students.length} នាក់\n`;
  for (const b of r.byTeam.filter((x) => x.count)) text += `   • ${esc(b.team)}: ${b.count} នាក់ · ${khr(b.totalKHR)}\n`;
  const counted = r.invoices.filter((i) => i.included);
  text += `🧾 វិក្កយបត្រមិនទាន់បង់: ${usd(r.totals.invoicesUSD)} · ${counted.length}\n`;
  const old = counted.filter((i) => Date.now() - new Date(i.date) > 14 * 86400000).slice(0, 5);
  for (const i of old) {
    const days = Math.floor((Date.now() - new Date(i.date)) / 86400000);
    text += `   • ${i.invoiceNo} ${esc(i.customer?.name || "")}: ${usd(i.balanceUSD)} (${days} ថ្ងៃ)\n`;
  }
  if (r.lent.length) text += `🤲 លុយដែលខ្ញុំឲ្យខ្ចី: ${usd(r.totals.lentUSD)} · ${r.lent.length} នាក់\n`;
  text += `\n💱 1$ = ៛${RATE.toLocaleString("en-US")}`;
  await send(a.telegramChatId, text);
}

async function dailySummary(a, now) {
  const t = pp(now);
  const hour = a.alerts?.dailyHour ?? 20;
  if (t.hour < hour) return;
  if (!(await once(`daily:${a._id}:${t.ymd}`, 5))) return;
  const { helpers } = require("../controllers/financeController");
  const start = dayStart(t.ymd);
  const end = new Date(start.getTime() + 86400000);
  const [invoices, sales, txns, accounts, pending, low] = await Promise.all([
    Invoice.find({ voided: false, planned: { $ne: true }, date: { $gte: start, $lt: end } }).select("total paidAmount").lean(),
    StockMovement.find({ type: "OUT", date: { $gte: start, $lt: end } }).select("totalAmount profit").lean(),
    FinanceTxn.find({ owner: a._id, date: { $gte: start, $lt: end }, category: { $nin: ["transfer", "invest"] } }).select("type amountUSD").lean(),
    helpers.accountsWithBalance({ adminId: a._id }),
    BotOrder.countDocuments({ status: "pending" }),
    Product.find({ $expr: { $lte: ["$stock", { $ifNull: ["$lowStockAlert", 5] }] } }).select("name stock").lean(),
  ]);
  const sold = sales.reduce((s, m) => s + (m.totalAmount || 0), 0);
  const profit = sales.reduce((s, m) => s + (m.profit || 0), 0);
  const inc = txns.filter((x) => x.type === "income").reduce((s, x) => s + x.amountUSD, 0);
  const exp = txns.filter((x) => x.type === "expense").reduce((s, x) => s + x.amountUSD, 0);
  const moneyNow = accounts.filter((x) => !x.archived).reduce((s, x) => s + x.balanceUSD, 0);
  let text = `📊 <b>សង្ខេបថ្ងៃនេះ ${dmy(t.ymd)}</b>\n\n`;
  text += `🏪 ហាង: លក់ ${usd(sold)} · ចំណេញ ${usd(profit)}\n`;
  text += `🧾 វិក្កយបត្រ: ${invoices.length} · សរុប ${usd(invoices.reduce((s, i) => s + i.total, 0))}\n`;
  text += `⬇️ ចំណូល: ${usd(inc)}\n⬆️ ចំណាយ: ${usd(exp)}\n`;
  text += `${inc - exp >= 0 ? "✅" : "🔻"} នៅសល់ថ្ងៃនេះ: <b>${usd(inc - exp)}</b>\n`;
  if (accounts.length) text += `💼 លុយបច្ចុប្បន្ន: <b>${usd(moneyNow)}</b> (${approx(moneyNow)})\n`;
  const { FinanceInvestEntry } = require("../models/Finance");
  const inv = await FinanceInvestEntry.find({ owner: a._id, type: "result", date: { $gte: start, $lt: end } }).select("amountUSD").lean();
  if (inv.length) {
    const p = inv.reduce((s, x) => s + x.amountUSD, 0);
    text += `📈 វិនិយោគ/ភ្នាល់ថ្ងៃនេះ: <b>${p >= 0 ? "+" : "−"}${usd(Math.abs(p))}</b>\n`;
  }
  if (pending) text += `\n🛒 ការកម្មង់ពី bot កំពុងរង់ចាំ: <b>${pending}</b>`;
  if (low.length) text += `\n📦 ទំនិញជិតអស់: ${low.slice(0, 6).map((p) => `${esc(p.name)} (${p.stock})`).join(", ")}${low.length > 6 ? "…" : ""}`;
  await send(a.telegramChatId, text);
}

let running = false;
async function runScheduled(now = new Date()) {
  if (running || !process.env.TELEGRAM_BOT_TOKEN) return { skipped: true };
  running = true;
  const done = [];
  try {
    const sts = await FinanceSettings.find({
      $or: [{ "alerts.debts": true }, { "alerts.owed": true }, { "alerts.daily": true }],
    }).lean();
    for (const st of sts) {
      const admin = await Admin.findOne({ _id: st.owner, role: "ADMIN", telegramChatId: { $nin: ["", null] } }).lean();
      if (!admin) continue;
      const a = { ...admin, alerts: st.alerts };
      try {
        if (st.alerts.debts) await debtReminders(a, now);
        if (st.alerts.owed) await weeklyOwed(a, now);
        if (st.alerts.daily) await dailySummary(a, now);
        done.push(admin.username);
      } catch (err) {
        console.warn("scheduled alerts failed:", err.message);
      }
    }
  } finally {
    running = false;
  }
  return { ok: true, admins: done.length };
}

module.exports = { alertNewOrder, stockChanged, alertAutoPaid, runScheduled, recipients, send, once };
