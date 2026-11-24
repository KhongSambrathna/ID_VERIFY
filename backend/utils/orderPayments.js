// KHQR payment for Telegram shop orders (bot chat + Mini App).
//
//   order placed → startPayment() makes a KHQR for the total and the bot
//   sends it to the customer as a picture → the customer scans it with any
//   bank app → runPaymentChecks() (every ~20 s, and whenever the customer
//   taps "I've paid") asks the Bakong API → when paid: the order is marked
//   paid, the customer + Admins + the payment group are told, and (if
//   autoConfirm is on) the order becomes a PAID invoice with stock cut.
//
// Admin can also check by hand (/verify BO-0012) or mark paid by hand after
// seeing the money arrive (bank app / the bank's Telegram notice).
const Admin = require("../models/Admin");
const { BotOrder } = require("../models/TelegramBot");
const { tg, tgUpload, esc } = require("./telegramApi");
const pay = require("./khqrPay");

const RATE = 4000;
const GRACE_MS = 10 * 60 * 1000; // keep checking 10 min after a QR expires (late bank confirmation)
const usd = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
const khr = (n) => `៛${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const fmtPay = (p) => (p.currency === "KHR" ? khr(p.amount) : usd(p.amount));
const send = (chatId, text, extra = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
const hhmm = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit" });

// Make the KHQR for an order (or a fresh one after it expired). Returns the
// payment, or null when KHQR payments are off / not set up.
async function startPayment(order) {
  const s = await pay.getSettings();
  if (!pay.ready(s)) return null;
  const currency = s.currency || "USD";
  const amount = currency === "KHR" ? Math.round((order.total * RATE) / 100) * 100 : order.total;
  const q = pay.makeQr(s, { amount, currency, billNumber: order.orderNo });
  order.payment = { ...((order.payment && order.payment.toObject && order.payment.toObject()) || {}), status: "unpaid", method: "khqr", qr: q.qr, md5: q.md5, amount: q.amount, currency: q.currency, expiresAt: q.expiresAt, paidAt: null, hash: "", fromAccount: "" };
  await order.save();
  return order.payment;
}

// Send the QR picture to the customer in Telegram.
async function sendQr(order) {
  const p = order.payment;
  if (!p || p.status !== "unpaid" || !p.qr) return null;
  const png = await pay.qrPng(p.qr);
  const caption =
    `💳 <b>បង់ប្រាក់ការកម្មង់ ${order.orderNo}</b>\n` +
    `💰 ចំនួន <b>${fmtPay(p)}</b>\n\n` +
    `📱 ស្កេន QR នេះដោយកម្មវិធីធនាគារណាមួយ (ABA, ACLEDA, Wing, Bakong…)\n` +
    `⏰ ប្រើបានដល់ម៉ោង <b>${hhmm(p.expiresAt)}</b>\n\n` +
    `ពេលបង់រួច ប្រព័ន្ធនឹងផ្ទៀងផ្ទាត់ដោយស្វ័យប្រវត្តិ ✅`;
  const m = await tgUpload(
    "sendPhoto",
    {
      chat_id: order.chatId,
      caption,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🔄 ខ្ញុំបានបង់រួច — ពិនិត្យ", callback_data: `pc:${order._id}` }]] },
    },
    { field: "photo", buffer: png, filename: `${order.orderNo}.png`, type: "image/png" }
  );
  if (m) {
    order.payment.qrMessageId = m.message_id;
    await order.save();
  }
  return m;
}

// Order placed → make + send the QR (no-op when KHQR is off).
async function offerPayment(order) {
  try {
    const p = await startPayment(order);
    if (p) await sendQr(order);
    return p;
  } catch (err) {
    console.warn("KHQR payment failed:", err.message);
    return null;
  }
}

// Somebody (Admin) to put on the invoice when it's made automatically.
async function invoiceAdmin() {
  const a = (await Admin.findOne({ role: "ADMIN", telegramChatId: { $nin: ["", null] } }).select("_id")) || (await Admin.findOne({ role: "ADMIN" }).select("_id"));
  return a ? a._id : null;
}

// Mark paid (once — safe if two checks find it at the same time), tell
// everyone, and confirm the order if set to.
// tx = Bakong transaction, or null when marked by hand (by = adminId).
async function markPaid(orderId, { tx = null, by = null } = {}) {
  const now = new Date();
  const order = await BotOrder.findOneAndUpdate(
    { _id: orderId, "payment.status": { $in: ["unpaid", "expired", "none"] } },
    {
      $set: {
        "payment.status": "paid",
        "payment.method": tx ? "khqr" : "manual",
        "payment.paidAt": tx?.acknowledgedDateMs ? new Date(tx.acknowledgedDateMs) : now,
        "payment.hash": tx?.hash || "",
        "payment.fromAccount": tx?.fromAccountId || "",
        "payment.markedBy": by,
      },
    },
    { new: true }
  );
  if (!order) return { already: true, order: await BotOrder.findById(orderId) };
  if (!order.payment.amount) {
    order.payment.amount = order.total;
    order.payment.currency = "USD";
    await order.save();
  }
  const p = order.payment;
  const s = await pay.getSettings();

  // Customer
  if (p.qrMessageId) {
    tg("editMessageReplyMarkup", {
      chat_id: order.chatId,
      message_id: p.qrMessageId,
      reply_markup: { inline_keyboard: [[{ text: "✅ បានបង់រួច", callback_data: "noop" }]] },
    }).catch(() => {});
  }
  await send(order.chatId, `✅ <b>បានទទួលការបង់ប្រាក់ ${fmtPay(p)}</b>\n🧾 ការកម្មង់ ${order.orderNo}\n\nសូមអរគុណ! 🙏`);

  // Admins + payment group
  const by_ = tx ? "🏦 ផ្ទៀងផ្ទាត់ជាមួយ Bakong" : "✍️ Admin កត់ដោយដៃ";
  const text =
    `💰 <b>បានទទួលលុយ ${fmtPay(p)}</b>\n🧾 ${order.orderNo} · 👤 ${esc(order.customer?.name || order.username || "")}` +
    `${order.customer?.phone ? ` · 📱 ${esc(order.customer.phone)}` : ""}\n${by_}` +
    (p.fromAccount ? `\n↪️ ពី ${esc(p.fromAccount)}` : "") +
    (p.hash ? `\n#️⃣ <code>${esc(p.hash.slice(0, 16))}</code>` : "");
  const { recipients } = require("./telegramAlerts");
  const to = await recipients("orders");
  for (const a of to) await send(a.telegramChatId, text);
  if (s.groupChatId) await send(s.groupChatId, text);
  require("./webNotify").webNotifyAdmins(text, { kind: "order", link: "/admin/telegram?tab=orders" });

  // Confirm → paid invoice
  let confirmed = null;
  if (s.autoConfirm && order.status === "pending") {
    const bot = require("../bot/shopBot");
    const r = await bot.confirmOrder(order._id, by || (await invoiceAdmin()));
    if (r.error) {
      for (const a of to) await send(a.telegramChatId, `⚠️ ${order.orderNo} បានបង់លុយហើយ តែបង្កើតវិក្កយបត្រមិនបាន៖ ${esc(r.error)}\nសូមពិនិត្យលើវេបសាយ។`);
    } else confirmed = r.invoice;
  }
  return { order, confirmed };
}

// Ask Bakong about every unpaid QR (or just these orders). Expired ones are
// marked expired after the grace time and the customer is offered a new QR.
let running = false;
async function runPaymentChecks({ orderIds = null } = {}) {
  if (running && !orderIds) return { skipped: true };
  if (!orderIds) running = true;
  const result = { checked: 0, paid: [], expired: [], error: "" };
  try {
    const filter = { "payment.status": "unpaid", "payment.md5": { $ne: "" } };
    if (orderIds) filter._id = { $in: orderIds };
    const orders = await BotOrder.find(filter).limit(200);
    if (!orders.length) return result;
    const s = await pay.getSettings();
    if (s.token) {
      for (let i = 0; i < orders.length; i += 50) {
        const batch = orders.slice(i, i + 50);
        let paidMap;
        try {
          paidMap = await pay.checkMd5s(s, batch.map((o) => o.payment.md5));
          if (s.lastCheckError) await s.constructor.updateOne({ _id: s._id }, { lastCheckError: "", lastCheckAt: new Date() });
        } catch (err) {
          result.error = err.message;
          await s.constructor.updateOne({ _id: s._id }, { lastCheckError: err.message, lastCheckAt: new Date() });
          break;
        }
        result.checked += batch.length;
        for (const o of batch) {
          const tx = paidMap.get(o.payment.md5);
          if (tx && pay.matches(tx, o.payment, s)) {
            await markPaid(o._id, { tx });
            result.paid.push(o.orderNo);
          }
        }
      }
    }
    // Expire unpaid QR codes past their time (+ grace).
    for (const o of orders) {
      if (result.paid.includes(o.orderNo)) continue;
      if (o.payment.expiresAt && Date.now() > new Date(o.payment.expiresAt).getTime() + GRACE_MS) {
        const done = await BotOrder.updateOne({ _id: o._id, "payment.status": "unpaid" }, { $set: { "payment.status": "expired" } });
        if (done.modifiedCount && o.status === "pending") {
          result.expired.push(o.orderNo);
          if (o.payment.qrMessageId) {
            tg("editMessageReplyMarkup", { chat_id: o.chatId, message_id: o.payment.qrMessageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
          }
          await send(o.chatId, `⏰ QR សម្រាប់ ${o.orderNo} ផុតកំណត់ហើយ។ បើនៅចង់បង់ សូមចុចខាងក្រោមដើម្បីយក QR ថ្មី។`, {
            reply_markup: { inline_keyboard: [[{ text: "🔁 QR ថ្មី", callback_data: `pn:${o._id}` }]] },
          });
        }
      }
    }
    return result;
  } finally {
    if (!orderIds) running = false;
  }
}

// /verify — Admin types an order no, a QR md5, or a bank transaction hash.
async function verify(arg) {
  const s = await pay.getSettings();
  arg = String(arg || "").trim();
  if (!arg) return { text: "ប្រើ៖ <code>/verify BO-0012</code> ឬ <code>/verify &lt;hash&gt;</code>" };
  let order = null;
  if (/^bo-\d+$/i.test(arg)) order = await BotOrder.findOne({ orderNo: arg.toUpperCase() });
  else if (/^[a-f0-9]{32}$/i.test(arg)) order = await BotOrder.findOne({ "payment.md5": arg.toLowerCase() });
  if (order) {
    if (order.payment?.status === "paid") {
      return { text: `✅ ${order.orderNo} បានបង់រួច ${fmtPay(order.payment)}${order.payment.hash ? `\n#️⃣ <code>${esc(order.payment.hash)}</code>` : ""}` };
    }
    if (!order.payment?.md5) return { text: `ℹ️ ${order.orderNo} មិនមាន KHQR ទេ (បានកម្មង់ពេលបិទ KHQR)។`, order };
    const tx = await pay.checkMd5(s, order.payment.md5);
    if (tx && pay.matches(tx, order.payment, s)) {
      await markPaid(order._id, { tx });
      return { text: `✅ ${order.orderNo}: Bakong បញ្ជាក់ថាបានបង់ ${fmtPay(order.payment)} ពី ${esc(tx.fromAccountId || "?")}` };
    }
    return { text: `⏳ ${order.orderNo}: Bakong មិនទាន់ឃើញការបង់ ${fmtPay(order.payment)} នៅឡើយ។`, order };
  }
  if (/^[a-f0-9]{64}$/i.test(arg)) {
    const tx = await pay.checkHash(s, arg.toLowerCase());
    if (!tx) return { text: "❌ រកមិនឃើញប្រតិបត្តិការនេះនៅ Bakong ទេ។" };
    const when = tx.acknowledgedDateMs ? new Date(tx.acknowledgedDateMs).toLocaleString("en-GB", { timeZone: "Asia/Phnom_Penh" }) : "";
    return {
      text:
        `✅ <b>ប្រតិបត្តិការមានពិត</b>\n💰 ${tx.currency === "KHR" ? khr(tx.amount) : usd(tx.amount)}\n↪️ ពី ${esc(tx.fromAccountId || "?")}\n➡️ ទៅ ${esc(tx.toAccountId || "?")}\n🕒 ${when}` +
        (tx.description ? `\n📝 ${esc(tx.description)}` : ""),
    };
  }
  return { text: "❓ រកមិនឃើញ — វាយលេខកម្មង់ (BO-0012), md5 (៣២ តួ) ឬ hash ប្រតិបត្តិការ (៦៤ តួ)។" };
}

module.exports = { startPayment, sendQr, offerPayment, markPaid, runPaymentChecks, verify, fmtPay };
