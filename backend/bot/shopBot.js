// BRATHNA SPORT SHOP — Telegram shop bot.
//
// Customers: /start → browse products (photo, price in $ and ≈ ៛) → add to
// cart → checkout (name, phone, note) → order sent to the Admin.
// Admin: gets each order in Telegram with ✅ / ❌ buttons. ✅ makes a real
// invoice (stock is cut automatically); the customer is told either way.
// Admin also links their Telegram here via t.me/<bot>?start=link_<code>.
//
// Telegram calls POST /api/telegram/webhook/<secret> with every update;
// handleUpdate() below does the work.
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Admin = require("../models/Admin");
const Counter = require("../models/Counter");
const { BotCart, BotOrder, TelegramLink } = require("../models/TelegramBot");
const { FinanceSettings } = require("../models/Finance");
const { effectivePrice } = require("../utils/pricing");
const { roundUSD } = require("../utils/currency");
const { tg, esc } = require("../utils/telegramApi");
const { SHOP_INFO } = require("../utils/shopInfo");

const RATE = 4000; // ៛ per $1 — same as the website
const PAGE = 8;

const usd = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
const riel = (n) => `៛${(Math.round(((Number(n) || 0) * RATE) / 100) * 100).toLocaleString("en-US")}`;
const money = (n) => `${usd(n)} (≈ ${riel(n)})`;

const BTN = { shop: "🛍 ទំនិញ", cart: "🧺 កន្ត្រក", orders: "📦 ការកម្មង់របស់ខ្ញុំ", contact: "📞 ទំនាក់ទំនង" };
const mainKeyboard = {
  keyboard: [[{ text: BTN.shop }, { text: BTN.cart }], [{ text: BTN.orders }, { text: BTN.contact }]],
  resize_keyboard: true,
  is_persistent: true,
};

const send = (chatId, text, extra = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

function absoluteImage(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const base = process.env.PUBLIC_API_URL || "";
  return base ? `${base.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}` : null;
}

async function getCart(from, chatId) {
  let cart = await BotCart.findOne({ chatId });
  if (!cart) cart = new BotCart({ chatId });
  if (from) {
    cart.username = from.username || cart.username || "";
    cart.firstName = [from.first_name, from.last_name].filter(Boolean).join(" ") || cart.firstName || "";
  }
  return cart;
}

// Cart lines with today's prices; drops products that are gone.
async function cartLines(cart) {
  const ids = cart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const lines = [];
  for (const it of cart.items) {
    const p = products.find((x) => String(x._id) === String(it.product));
    if (!p) continue;
    const { unitPrice, listPrice } = effectivePrice(p, it.qty, false);
    lines.push({ product: p, qty: it.qty, unitPrice, listPrice, total: roundUSD(unitPrice * it.qty) });
  }
  return { lines, total: roundUSD(lines.reduce((s, l) => s + l.total, 0)) };
}

// ---------------- Customer screens ----------------

async function welcome(chatId, name) {
  await send(
    chatId,
    `សួស្តី${name ? ` <b>${esc(name)}</b>` : ""}! 👋\nស្វាគមន៍មកកាន់ <b>${SHOP_INFO.name}</b> ⚽\n\n` +
      `ចុច <b>${BTN.shop}</b> ដើម្បីមើលទំនិញ ដាក់ក្នុងកន្ត្រក ហើយកម្មង់បានភ្លាមៗ។`,
    { reply_markup: mainKeyboard }
  );
  await showList(chatId, 0);
}

async function showList(chatId, page, editMessageId) {
  const { publicProductList } = require("../controllers/productController");
  const list = await publicProductList();
  if (!list.length) return send(chatId, "សូមអភ័យទោស ឥឡូវនេះមិនទាន់មានទំនិញទេ 🙏");
  const pages = Math.ceil(list.length / PAGE);
  const pg = Math.min(Math.max(page, 0), pages - 1);
  const rows = list.slice(pg * PAGE, pg * PAGE + PAGE).map((p) => [
    {
      text: `${p.bestSeller ? "🔥 " : p.discountActive ? "🏷 " : ""}${p.name} — ${usd(p.salePrice)}`,
      callback_data: `p:${p._id}`,
    },
  ]);
  const nav = [];
  if (pg > 0) nav.push({ text: "◀️", callback_data: `l:${pg - 1}` });
  if (pages > 1) nav.push({ text: `${pg + 1}/${pages}`, callback_data: "noop" });
  if (pg < pages - 1) nav.push({ text: "▶️", callback_data: `l:${pg + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: BTN.cart, callback_data: "c" }]);
  const text = `🛍 <b>ទំនិញ</b> (${list.length} មុខ) — ចុចលើទំនិញដើម្បីមើលរូប និងកម្មង់`;
  if (editMessageId) {
    const ok = await tg("editMessageText", { chat_id: chatId, message_id: editMessageId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
    if (ok) return ok;
  }
  return send(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function showProduct(chatId, id) {
  if (!mongoose.isValidObjectId(id)) return;
  const p = await Product.findById(id).lean();
  if (!p || p.stock <= 0) return send(chatId, "សូមអភ័យទោស ទំនិញនេះអស់ស្តុកហើយ 🙏");
  const one = effectivePrice(p, 1, false);
  let caption = `<b>${esc(p.name)}</b>\n`;
  if (one.unitPrice < p.price) caption += `💵 <s>${usd(p.price)}</s> <b>${usd(one.unitPrice)}</b>  (≈ ${riel(one.unitPrice)})`;
  else caption += `💵 <b>${usd(p.price)}</b>  (≈ ${riel(p.price)})`;
  if (p.discountActive || p.discountPercent > 0) {
    if (one.unitPrice < p.price) caption += `  🏷 -${p.discountPercent}%`;
  }
  if (p.wholesalePrice > 0 && p.wholesaleMinQty > 0) {
    caption += `\n📦 ទិញចាប់ពី ${p.wholesaleMinQty} ${esc(p.unit || "")} ឡើង: ${usd(p.wholesalePrice)}/${esc(p.unit || "pcs")}`;
  }
  caption += `\n✅ មានក្នុងស្តុក`;
  if (p.description) caption += `\n\n${esc(String(p.description).slice(0, 500))}`;
  caption += `\n\nជ្រើសចំនួនដើម្បីដាក់ក្នុងកន្ត្រក 👇`;
  const qtys = [1, 2, 3, 5, 10].filter((q) => q <= p.stock);
  const keyboard = {
    inline_keyboard: [
      qtys.map((q) => ({ text: `+${q}`, callback_data: `a:${p._id}:${q}` })),
      [
        { text: "⬅️ ទំនិញ", callback_data: "l:0" },
        { text: BTN.cart, callback_data: "c" },
      ],
    ],
  };
  const photo = absoluteImage(p.imageUrl);
  if (photo) {
    const ok = await tg("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup: keyboard });
    if (ok) return ok;
  }
  return send(chatId, caption, { reply_markup: keyboard });
}

async function addToCart(cb, id, qty) {
  const chatId = String(cb.message.chat.id);
  if (!mongoose.isValidObjectId(id)) return;
  const p = await Product.findById(id).lean();
  if (!p || p.stock <= 0) return tg("answerCallbackQuery", { callback_query_id: cb.id, text: "អស់ស្តុកហើយ", show_alert: true });
  const cart = await getCart(cb.from, chatId);
  const line = cart.items.find((i) => String(i.product) === String(id));
  const want = (line ? line.qty : 0) + qty;
  const finalQty = Math.min(want, p.stock);
  if (line) line.qty = finalQty;
  else cart.items.push({ product: p._id, qty: finalQty });
  await cart.save();
  const capped = finalQty < want;
  await tg("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: capped ? `មានតែ ${p.stock} ក្នុងស្តុក` : `✅ ${p.name} ×${finalQty}`,
  });
  const { total, lines } = await cartLines(cart);
  return send(chatId, `✅ បានដាក់ <b>${esc(p.name)}</b> ×${finalQty} ក្នុងកន្ត្រក\n🧺 ${lines.length} មុខ · សរុប <b>${money(total)}</b>`, {
    reply_markup: {
      inline_keyboard: [[{ text: "🛍 បន្តទិញ", callback_data: "l:0" }, { text: "🧺 មើលកន្ត្រក / កម្មង់", callback_data: "c" }]],
    },
  });
}

function cartView(lines, total) {
  if (!lines.length) {
    return {
      text: "🧺 កន្ត្រករបស់អ្នកនៅទទេ។",
      reply_markup: { inline_keyboard: [[{ text: "🛍 មើលទំនិញ", callback_data: "l:0" }]] },
    };
  }
  let text = "🧺 <b>កន្ត្រករបស់អ្នក</b>\n\n";
  lines.forEach((l, i) => {
    text += `${i + 1}. ${esc(l.product.name)}\n    ${l.qty} × ${usd(l.unitPrice)}${l.unitPrice < l.listPrice ? ` <s>${usd(l.listPrice)}</s>` : ""} = <b>${usd(l.total)}</b>\n`;
  });
  text += `\n💰 សរុប: <b>${money(total)}</b>`;
  const rows = lines.map((l) => [
    { text: "➖", callback_data: `q:${l.product._id}:-1` },
    { text: `${l.product.name.slice(0, 22)} ×${l.qty}`, callback_data: "noop" },
    { text: "➕", callback_data: `q:${l.product._id}:1` },
  ]);
  rows.push([{ text: "🗑 សម្អាត", callback_data: "x" }, { text: "🛍 បន្តទិញ", callback_data: "l:0" }]);
  rows.push([{ text: "✅ កម្មង់ឥឡូវនេះ", callback_data: "co" }]);
  return { text, reply_markup: { inline_keyboard: rows } };
}

async function showCart(chatId, from, editMessageId) {
  const cart = await getCart(from, chatId);
  const { lines, total } = await cartLines(cart);
  const view = cartView(lines, total);
  if (editMessageId) {
    const ok = await tg("editMessageText", { chat_id: chatId, message_id: editMessageId, parse_mode: "HTML", ...view });
    if (ok) return ok;
  }
  return send(chatId, view.text, { reply_markup: view.reply_markup });
}

async function changeQty(cb, id, delta) {
  const chatId = String(cb.message.chat.id);
  const cart = await getCart(cb.from, chatId);
  const line = cart.items.find((i) => String(i.product) === String(id));
  if (line) {
    const p = await Product.findById(id).lean();
    line.qty = Math.min(line.qty + delta, p ? p.stock : line.qty);
    if (line.qty <= 0 || !p) cart.items = cart.items.filter((i) => i !== line);
    await cart.save();
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  return showCart(chatId, cb.from, cb.message.message_id);
}

// ---------------- Checkout ----------------

async function startCheckout(chatId, from) {
  const cart = await getCart(from, chatId);
  const { lines } = await cartLines(cart);
  if (!lines.length) return send(chatId, "🧺 កន្ត្រករបស់អ្នកនៅទទេ។ ចុច " + BTN.shop + " ដើម្បីជ្រើសទំនិញ។");
  for (const l of lines) {
    if (l.qty > l.product.stock) {
      return send(chatId, `⚠️ <b>${esc(l.product.name)}</b> នៅសល់តែ ${l.product.stock} ប៉ុណ្ណោះ។ សូមកែចំនួនក្នុងកន្ត្រក។`);
    }
  }
  if (!cart.name) {
    cart.step = "name";
    await cart.save();
    return send(chatId, "👤 សូមវាយ <b>ឈ្មោះ</b> របស់អ្នក (ឬឈ្មោះក្រុម/សាលា):", {
      reply_markup: { force_reply: true, input_field_placeholder: "ឈ្មោះ" },
    });
  }
  if (!cart.phone) return askPhone(cart);
  return askNote(cart);
}

async function askPhone(cart) {
  cart.step = "phone";
  await cart.save();
  return send(cart.chatId, "📱 សូមផ្ញើ <b>លេខទូរស័ព្ទ</b> (ចុចប៊ូតុងខាងក្រោម ឬវាយលេខ):", {
    reply_markup: {
      keyboard: [[{ text: "📱 ផ្ញើលេខទូរស័ព្ទរបស់ខ្ញុំ", request_contact: true }], [{ text: "❌ បោះបង់" }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

async function askNote(cart) {
  cart.step = "note";
  await cart.save();
  return send(cart.chatId, "📝 មានអ្វីចង់ប្រាប់បន្ថែមទេ? (ទីតាំងដឹក ទំហំអាវ ពណ៌…)\nវាយសារ ឬចុច «រំលង»។", {
    reply_markup: { keyboard: [[{ text: "⏭ រំលង" }], [{ text: "❌ បោះបង់" }]], resize_keyboard: true, one_time_keyboard: true },
  });
}

async function askConfirm(cart) {
  cart.step = "confirm";
  await cart.save();
  const { lines, total } = await cartLines(cart);
  let text = "🧾 <b>សូមពិនិត្យការកម្មង់</b>\n\n";
  lines.forEach((l, i) => (text += `${i + 1}. ${esc(l.product.name)} — ${l.qty} × ${usd(l.unitPrice)} = ${usd(l.total)}\n`));
  text += `\n💰 សរុប: <b>${money(total)}</b>\n👤 ${esc(cart.name)}\n📱 ${esc(cart.phone)}`;
  if (cart.note) text += `\n📝 ${esc(cart.note)}`;
  await send(cart.chatId, "👌", { reply_markup: mainKeyboard });
  return send(cart.chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ បញ្ជាក់ការកម្មង់", callback_data: "ok" }],
        [{ text: "✏️ ប្ដូរឈ្មោះ/លេខ", callback_data: "ed" }, { text: "❌ បោះបង់", callback_data: "cx" }],
      ],
    },
  });
}

async function nextOrderNo() {
  const c = await Counter.findOneAndUpdate({ name: "botorder" }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `BO-${String(c.seq).padStart(4, "0")}`;
}

async function placeOrder(cb) {
  const chatId = String(cb.message.chat.id);
  const cart = await getCart(cb.from, chatId);
  const { lines, total } = await cartLines(cart);
  if (!lines.length) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "កន្ត្រកនៅទទេ" });
    return;
  }
  for (const l of lines) {
    if (l.qty > l.product.stock) {
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: `${l.product.name}: នៅសល់តែ ${l.product.stock}`, show_alert: true });
      return;
    }
  }
  const order = await BotOrder.create({
    orderNo: await nextOrderNo(),
    chatId,
    username: cart.username,
    customer: { name: cart.name, phone: cart.phone },
    items: lines.map((l) => ({
      product: l.product._id,
      name: l.product.name,
      unit: l.product.unit || "pcs",
      qty: l.qty,
      unitPrice: l.unitPrice,
      listPrice: l.listPrice,
    })),
    total,
    note: cart.note,
  });
  cart.items = [];
  cart.note = "";
  cart.step = "";
  await cart.save();
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "✅ បានកម្មង់" });
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } });
  await send(
    chatId,
    `✅ <b>ទទួលបានការកម្មង់ ${order.orderNo}</b>\n💰 សរុប ${money(total)}\n\nយើងនឹងទាក់ទងទៅលេខ ${esc(cart.phone)} ឆាប់ៗនេះ។ សូមអរគុណ! 🙏\n📞 ${SHOP_INFO.phone}`,
    { reply_markup: mainKeyboard }
  );
  require("../utils/telegramAlerts").alertNewOrder(order).catch(() => {});
}

async function myOrders(chatId) {
  const list = await BotOrder.find({ chatId }).sort({ createdAt: -1 }).limit(5).lean();
  if (!list.length) return send(chatId, "📦 អ្នកមិនទាន់មានការកម្មង់ទេ។", { reply_markup: mainKeyboard });
  const label = { pending: "⏳ កំពុងរង់ចាំ", confirmed: "✅ បានយល់ព្រម", rejected: "❌ មិនអាចធ្វើបាន", cancelled: "🚫 បានបោះបង់" };
  let text = "📦 <b>ការកម្មង់ចុងក្រោយរបស់អ្នក</b>\n";
  for (const o of list) {
    const d = new Date(o.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh" });
    text += `\n<b>${o.orderNo}</b> · ${d} · ${usd(o.total)}\n${label[o.status]}\n${o.items.map((i) => `  • ${esc(i.name)} ×${i.qty}`).join("\n")}\n`;
  }
  return send(chatId, text, { reply_markup: mainKeyboard });
}

function contact(chatId) {
  return send(
    chatId,
    `🏪 <b>${SHOP_INFO.name}</b>\n📞 ${SHOP_INFO.phone}\n📍 ${SHOP_INFO.address}`,
    { reply_markup: mainKeyboard }
  );
}

// ---------------- Admin: link + confirm / reject ----------------

async function linkAdmin(chatId, code, from) {
  const link = await TelegramLink.findOne({ code });
  if (!link) return send(chatId, "⚠️ តំណនេះផុតកំណត់ ឬប្រើរួចហើយ។ សូមចុច «ភ្ជាប់ Telegram» ម្ដងទៀតនៅលើវេបសាយ។");
  const admin = await Admin.findById(link.admin);
  await link.deleteOne();
  if (!admin) return;
  admin.telegramChatId = chatId;
  await admin.save();
  // Linking from the bot page turns my alerts on (each can be turned off there).
  let st = await FinanceSettings.findOne({ owner: admin._id });
  if (!st) st = new FinanceSettings({ owner: admin._id });
  if (!st.alerts || !["orders", "stock", "debts", "owed", "daily"].some((k) => st.alerts[k])) {
    st.alerts = { orders: true, stock: true, debts: true, owed: true, daily: true, dailyHour: st.alerts?.dailyHour ?? 20 };
  }
  await st.save();
  return send(
    chatId,
    `✅ បានភ្ជាប់ Telegram ទៅគណនី <b>${esc(admin.username)}</b> ហើយ!\n\n` +
      `ពីពេលនេះ អ្នកនឹងទទួលបាន៖\n• 🛒 ការកម្មង់ថ្មីពី bot (មានប៊ូតុង យល់ព្រម/បដិសេធ)\n• 📦 ទំនិញជិតអស់ស្តុក\n• 💳 ថ្ងៃសងបំណុល\n• 🤝 អ្នកជំពាក់ (រៀងរាល់ថ្ងៃច័ន្ទ)\n• 📊 សង្ខេបប្រចាំថ្ងៃ\n\n` +
      `សារទាំងនេះផ្ញើមកតែអ្នកប៉ុណ្ណោះ 🔒 — កែបាននៅទំព័រ Telegram bot លើវេបសាយ។`
  );
}

async function isOrderAdmin(chatId) {
  const admin = await Admin.findOne({ role: "ADMIN", telegramChatId: String(chatId) });
  if (!admin) return null;
  const st = await FinanceSettings.findOne({ owner: admin._id }).lean();
  return st?.alerts?.orders ? admin : null;
}

// Confirm → invoice (stock cut). Shared by Telegram buttons and the website.
async function confirmOrder(orderId, adminId) {
  const order = await BotOrder.findById(orderId);
  if (!order) return { error: "Order not found" };
  if (order.status !== "pending") return { error: `Already ${order.status}`, order };
  const { createInvoice } = require("../controllers/invoiceController");
  const result = await new Promise((resolve) => {
    const res = {
      code: 200,
      status(c) {
        this.code = c;
        return this;
      },
      json(d) {
        resolve({ code: this.code, data: d });
      },
    };
    createInvoice(
      {
        adminId,
        body: {
          customer: { name: order.customer.name || order.username || "Telegram", phone: order.customer.phone },
          items: order.items.map((i) => (i.product ? { productId: String(i.product), quantity: i.qty, unitPrice: i.unitPrice } : { name: i.name, quantity: i.qty, unitPrice: i.unitPrice })),
          paidAmount: 0,
          language: "km",
          note: `Telegram ${order.orderNo}${order.username ? ` (@${order.username})` : ""}${order.note ? ` · ${order.note}` : ""}`,
        },
      },
      res
    );
  });
  if (result.code >= 400) return { error: result.data?.message || "Could not make the invoice", order };
  order.status = "confirmed";
  order.invoice = result.data._id;
  order.handledBy = adminId;
  order.handledAt = new Date();
  await order.save();
  await send(
    order.chatId,
    `✅ <b>ការកម្មង់ ${order.orderNo} ត្រូវបានយល់ព្រម!</b>\n🧾 វិក្កយបត្រ ${result.data.invoiceNo}\n💰 សរុប ${money(result.data.total)}\n\nសូមអរគុណដែលបានគាំទ្រ ${SHOP_INFO.name} 🙏`,
    { reply_markup: mainKeyboard }
  );
  await markAdminMessages(order, `✅ បានយល់ព្រម · វិក្កយបត្រ ${result.data.invoiceNo}`);
  return { order, invoice: result.data };
}

async function rejectOrder(orderId, adminId) {
  const order = await BotOrder.findById(orderId);
  if (!order) return { error: "Order not found" };
  if (order.status !== "pending") return { error: `Already ${order.status}`, order };
  order.status = "rejected";
  order.handledBy = adminId;
  order.handledAt = new Date();
  await order.save();
  await send(
    order.chatId,
    `😔 សូមអភ័យទោស ការកម្មង់ <b>${order.orderNo}</b> មិនអាចធ្វើបានទេពេលនេះ។\nសូមទាក់ទង 📞 ${SHOP_INFO.phone} សម្រាប់ព័ត៌មានបន្ថែម។`,
    { reply_markup: mainKeyboard }
  );
  await markAdminMessages(order, "❌ បានបដិសេធ");
  return { order };
}

// Replace the ✅/❌ buttons on every admin alert about this order.
async function markAdminMessages(order, label) {
  for (const m of order.adminMessages || []) {
    await tg("editMessageReplyMarkup", {
      chat_id: m.chatId,
      message_id: m.messageId,
      reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop" }]] },
    });
  }
}

// ---------------- Router ----------------

async function onMessage(msg) {
  const chatId = String(msg.chat.id);
  if (msg.chat.type !== "private") return; // shop works in private chats only
  const text = (msg.text || "").trim();

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] || "";
    if (payload.startsWith("link_")) return linkAdmin(chatId, payload.slice(5), msg.from);
    const cart = await getCart(msg.from, chatId);
    cart.step = "";
    await cart.save();
    if (payload.startsWith("p_")) {
      await send(chatId, `ស្វាគមន៍មកកាន់ <b>${SHOP_INFO.name}</b> ⚽`, { reply_markup: mainKeyboard });
      return showProduct(chatId, payload.slice(2));
    }
    return welcome(chatId, msg.from?.first_name);
  }
  if (text === "/id") return send(chatId, `🆔 Chat ID: <code>${chatId}</code>`);
  if (text === "/shop" || text === BTN.shop) return showList(chatId, 0);
  if (text === "/cart" || text === BTN.cart) return showCart(chatId, msg.from);
  if (text === "/orders" || text === BTN.orders) return myOrders(chatId);
  if (text === "/contact" || text === "/help" || text === BTN.contact) return contact(chatId);

  const cart = await getCart(msg.from, chatId);
  if (text === "/cancel" || text === "❌ បោះបង់") {
    cart.step = "";
    await cart.save();
    return send(chatId, "បានបោះបង់។ ទំនិញនៅក្នុងកន្ត្រកនៅដដែល។", { reply_markup: mainKeyboard });
  }
  if (cart.step === "name" && text) {
    cart.name = text.slice(0, 80);
    await cart.save();
    return cart.phone ? askNote(cart) : askPhone(cart);
  }
  if (cart.step === "phone") {
    const phone = msg.contact ? msg.contact.phone_number : text;
    const digits = String(phone || "").replace(/[^\d+]/g, "");
    if (digits.replace(/\D/g, "").length < 8) return send(chatId, "⚠️ លេខទូរស័ព្ទមិនត្រឹមត្រូវ។ សូមព្យាយាមម្ដងទៀត (ឧ. 012 345 678)។");
    cart.phone = String(phone).slice(0, 30);
    await cart.save();
    return askNote(cart);
  }
  if (cart.step === "note") {
    cart.note = text === "⏭ រំលង" ? "" : text.slice(0, 300);
    await cart.save();
    return askConfirm(cart);
  }
  // Anything else: show the menu.
  return send(chatId, `ចុច <b>${BTN.shop}</b> ដើម្បីមើលទំនិញ ឬ <b>${BTN.cart}</b> ដើម្បីមើលកន្ត្រក។`, { reply_markup: mainKeyboard });
}

async function onCallback(cb) {
  const data = cb.data || "";
  const chatId = String(cb.message?.chat?.id || cb.from.id);
  const msgId = cb.message?.message_id;
  const [cmd, a, b] = data.split(":");
  const ack = (text, alert) => tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: Boolean(alert) });

  switch (cmd) {
    case "noop":
      return ack();
    case "l":
      await ack();
      // a product card is a photo → can't be edited into the list; send new
      return showList(chatId, Number(a) || 0, cb.message?.photo ? null : msgId);
    case "p":
      await ack();
      return showProduct(chatId, a);
    case "a":
      return addToCart(cb, a, Math.max(parseInt(b, 10) || 1, 1));
    case "c":
      await ack();
      return showCart(chatId, cb.from, cb.message?.photo ? null : msgId);
    case "q":
      return changeQty(cb, a, Number(b) || 0);
    case "x": {
      const cart = await getCart(cb.from, chatId);
      cart.items = [];
      await cart.save();
      await ack("🗑 បានសម្អាត");
      return showCart(chatId, cb.from, msgId);
    }
    case "co":
      await ack();
      return startCheckout(chatId, cb.from);
    case "ed": {
      const cart = await getCart(cb.from, chatId);
      cart.name = "";
      cart.phone = "";
      await cart.save();
      await ack();
      return startCheckout(chatId, cb.from);
    }
    case "cx": {
      const cart = await getCart(cb.from, chatId);
      cart.step = "";
      await cart.save();
      await ack("បានបោះបង់");
      return tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
    }
    case "ok":
      return placeOrder(cb);
    case "bo": {
      // Admin: bo:y:<orderId> / bo:n:<orderId>
      const admin = await isOrderAdmin(cb.from.id);
      if (!admin) return ack("មិនមានសិទ្ធិ", true);
      const r = a === "y" ? await confirmOrder(b, admin._id) : await rejectOrder(b, admin._id);
      if (r.error) return ack(`⚠️ ${r.error}`, true);
      return ack(a === "y" ? "✅ បានបង្កើតវិក្កយបត្រ" : "❌ បានបដិសេធ");
    }
    default:
      return ack();
  }
}

async function handleUpdate(update) {
  try {
    if (update.message) return await onMessage(update.message);
    if (update.callback_query) return await onCallback(update.callback_query);
  } catch (err) {
    console.warn("Bot update failed:", err.message);
  }
}

module.exports = { handleUpdate, confirmOrder, rejectOrder, BTN, usd, riel, money };
