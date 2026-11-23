// BRATHNA SPORT SHOP — Telegram shop bot.
//
// Customers: /start → browse products (photo, price in $ and ≈ ៛) → add to
// cart → checkout (name, phone, note) → order sent to the Admin.
// Admin: gets each order in Telegram with ✅ / ❌ buttons. ✅ makes a real
// invoice (stock is cut automatically); the customer is told either way.
// Admin also links their Telegram here via t.me/<bot>?start=link_<code>.
// Mini App: the 🛍 "open shop" buttons open /tg-shop on the website inside
// Telegram (scrollable product grid + cart + checkout).
// Live chat: any other message a customer sends is copied to the Admin's
// Telegram; the Admin presses Reply on it and the bot sends the answer back.
//
// Telegram calls POST /api/telegram/webhook/<secret> with every update;
// handleUpdate() below does the work.
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Admin = require("../models/Admin");
const Counter = require("../models/Counter");
const { BotCart, BotOrder, TelegramLink, BotRelay, AccountLinkCode } = require("../models/TelegramBot");
const { FinanceSettings } = require("../models/Finance");
const { effectivePrice } = require("../utils/pricing");
const { roundUSD } = require("../utils/currency");
const { tg, esc } = require("../utils/telegramApi");
const { SHOP_INFO } = require("../utils/shopInfo");
const { miniAppUrl } = require("../utils/telegramWebApp");
const payments = require("../utils/orderPayments");

const RATE = 4000; // ៛ per $1 — same as the website
const PAGE = 8;

const usd = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
const riel = (n) => `៛${(Math.round(((Number(n) || 0) * RATE) / 100) * 100).toLocaleString("en-US")}`;
const money = (n) => `${usd(n)} (≈ ${riel(n)})`;

const BTN = { shop: "🛍 ទំនិញ", cart: "🧺 កន្ត្រក", orders: "📦 ការកម្មង់របស់ខ្ញុំ", contact: "📞 ទំនាក់ទំនង", account: "👤 គណនីរបស់ខ្ញុំ" };
const mainKeyboard = {
  keyboard: [[{ text: BTN.shop }, { text: BTN.cart }], [{ text: BTN.orders }, { text: BTN.contact }], [{ text: BTN.account }]],
  resize_keyboard: true,
  is_persistent: true,
};

// Inline button that opens the Mini App shop inside Telegram.
const openShopButton = (text = "🛍 បើកហាង (អូសមើលទំនិញ)") => ({ text, web_app: { url: miniAppUrl() } });

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
      `ចុច <b>🛍 បើកហាង</b> ខាងក្រោម ដើម្បីអូសមើលទំនិញ ដាក់ក្នុងកន្ត្រក ហើយកម្មង់បានភ្លាមៗ។\n` +
      `💬 មានសំណួរ? សរសេរសារនៅទីនេះ — ហាងនឹងឆ្លើយតបអ្នក។`,
    { reply_markup: mainKeyboard }
  );
  await send(chatId, "👇", { reply_markup: { inline_keyboard: [[openShopButton()]] } });
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
  rows.unshift([openShopButton("📱 មើលជារូបភាព (Mini App)")]);
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
  await payments.offerPayment(order); // KHQR picture to scan (when switched on)
  require("../utils/telegramAlerts").alertNewOrder(order).catch(() => {});
}

// Order from the Mini App (/tg-shop). `user` is the verified Telegram user,
// `items` [{ id, qty }]. Prices are always recalculated here from the
// database — whatever the page showed is never trusted. Returns
// { order } or { error }.
async function placeWebAppOrder(user, { items, name, phone, note }) {
  const chatId = String(user.id);
  name = String(name || "").trim().slice(0, 80);
  phone = String(phone || "").trim().slice(0, 30);
  note = String(note || "").trim().slice(0, 300);
  if (!name) return { error: "សូមបញ្ចូលឈ្មោះ" };
  if (String(phone).replace(/\D/g, "").length < 8) return { error: "លេខទូរស័ព្ទមិនត្រឹមត្រូវ" };

  const wanted = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const qty = Math.floor(Number(it?.qty) || 0);
    if (!mongoose.isValidObjectId(it?.id) || qty < 1) continue;
    wanted.set(String(it.id), (wanted.get(String(it.id)) || 0) + qty);
  }
  if (!wanted.size) return { error: "កន្ត្រកនៅទទេ" };

  const products = await Product.find({ _id: { $in: [...wanted.keys()] } }).lean();
  const lines = [];
  for (const [id, qty] of wanted) {
    const p = products.find((x) => String(x._id) === id);
    if (!p || p.stock <= 0) return { error: `${p ? p.name : "ទំនិញមួយ"} អស់ស្តុកហើយ` };
    if (qty > p.stock) return { error: `${p.name}: នៅសល់តែ ${p.stock}` };
    const { unitPrice, listPrice } = effectivePrice(p, qty, false);
    lines.push({ product: p, qty, unitPrice, listPrice, total: roundUSD(unitPrice * qty) });
  }
  const total = roundUSD(lines.reduce((s, l) => s + l.total, 0));

  // Remember name/phone for next time (same record the chat checkout uses).
  const cart = await getCart(user, chatId);
  cart.name = name;
  cart.phone = phone;
  cart.step = "";
  await cart.save();

  const order = await BotOrder.create({
    orderNo: await nextOrderNo(),
    chatId,
    username: user.username || "",
    customer: { name, phone },
    items: lines.map((l) => ({
      product: l.product._id,
      name: l.product.name,
      unit: l.product.unit || "pcs",
      qty: l.qty,
      unitPrice: l.unitPrice,
      listPrice: l.listPrice,
    })),
    total,
    note,
  });
  let text = `✅ <b>ទទួលបានការកម្មង់ ${order.orderNo}</b>\n\n`;
  lines.forEach((l, i) => (text += `${i + 1}. ${esc(l.product.name)} — ${l.qty} × ${usd(l.unitPrice)} = ${usd(l.total)}\n`));
  text += `\n💰 សរុប ${money(total)}\n\nយើងនឹងទាក់ទងទៅលេខ ${esc(phone)} ឆាប់ៗនេះ។ សូមអរគុណ! 🙏\n📞 ${SHOP_INFO.phone}`;
  await send(chatId, text, { reply_markup: mainKeyboard });
  await payments.offerPayment(order); // KHQR picture in the chat too
  require("../utils/telegramAlerts").alertNewOrder(order).catch(() => {});
  return { order };
}

// Saved name/phone for pre-filling the Mini App checkout.
async function webAppProfile(user) {
  const cart = await BotCart.findOne({ chatId: String(user.id) }).lean();
  return {
    name: cart?.name || [user.first_name, user.last_name].filter(Boolean).join(" "),
    phone: cart?.phone || "",
  };
}

async function myOrders(chatId) {
  const list = await BotOrder.find({ chatId }).sort({ createdAt: -1 }).limit(5).lean();
  if (!list.length) return send(chatId, "📦 អ្នកមិនទាន់មានការកម្មង់ទេ។", { reply_markup: mainKeyboard });
  const label = { pending: "⏳ កំពុងរង់ចាំ", confirmed: "✅ បានយល់ព្រម", rejected: "❌ មិនអាចធ្វើបាន", cancelled: "🚫 បានបោះបង់" };
  let text = "📦 <b>ការកម្មង់ចុងក្រោយរបស់អ្នក</b>\n";
  for (const o of list) {
    const d = new Date(o.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh" });
    const paid = o.payment?.status === "paid" ? " · 💳 បានបង់" : o.payment?.status === "unpaid" ? " · 💳 មិនទាន់បង់" : "";
    text += `\n<b>${o.orderNo}</b> · ${d} · ${usd(o.total)}\n${label[o.status]}${paid}\n${o.items.map((i) => `  • ${esc(i.name)} ×${i.qty}`).join("\n")}\n`;
  }
  return send(chatId, text, { reply_markup: mainKeyboard });
}

function contact(chatId) {
  return send(
    chatId,
    `🏪 <b>${SHOP_INFO.name}</b>\n📞 ${SHOP_INFO.phone}\n📍 ${SHOP_INFO.address}\n\n💬 ឬសរសេរសារនៅទីនេះ — ហាងនឹងឆ្លើយតបតាម Telegram។`,
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
          // Paid by KHQR (or marked paid) → a PAID invoice.
          paidAmount: order.payment?.status === "paid" ? order.total : 0,
          language: "km",
          note:
            `Telegram ${order.orderNo}${order.username ? ` (@${order.username})` : ""}${order.note ? ` · ${order.note}` : ""}` +
            (order.payment?.status === "paid" ? ` · ${order.payment.method === "khqr" ? "KHQR" : "Paid"}${order.payment.hash ? ` ${order.payment.hash.slice(0, 10)}` : ""}` : ""),
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
    `✅ <b>ការកម្មង់ ${order.orderNo} ត្រូវបានយល់ព្រម!</b>\n🧾 វិក្កយបត្រ ${result.data.invoiceNo}\n💰 សរុប ${money(result.data.total)}${order.payment?.status === "paid" ? " · ✅ បានបង់រួច" : ""}\n\nសូមអរគុណដែលបានគាំទ្រ ${SHOP_INFO.name} 🙏`,
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

// ---------------- Website accounts (link · reset password) ----------------
// Anyone with a login on the website (Admin, Head Coach, Player, Referee)
// links this Telegram chat with their username + a one-time code (made in
// Settings, or by Admin / their Head Coach). Linked accounts then get the
// site's Telegram notifications here and can reset their password here.

const ROLE_KM = { ADMIN: "Admin", HEAD_COACH: "គ្រូបង្វឹក", PLAYER: "កីឡាករ", REFEREE: "អាជ្ញាកណ្ដាល" };
const MAX_LINK_FAILS = 5;

async function accountMenu(chatId) {
  const accounts = await Admin.find({ telegramChatId: chatId }).select("username role team").lean();
  let text = "👤 <b>គណនីលើវេបសាយ</b>\n\n";
  const rows = [];
  if (!accounts.length) {
    text +=
      "Telegram នេះមិនទាន់ភ្ជាប់គណនីណាទេ។\n\n" +
      "ភ្ជាប់ ដើម្បី៖\n• 🔔 ទទួលព័ត៌មាន/ការជូនដំណឹងពីវេបសាយ\n• 🔑 កំណត់លេខសម្ងាត់ថ្មីនៅទីនេះ ពេលភ្លេច\n\n" +
      "ត្រូវការ <b>username</b> និង <b>លេខកូដ ៦ ខ្ទង់</b>៖ យកពីទំព័រ ការកំណត់ (Settings) លើវេបសាយ ឬសុំពី Admin / គ្រូបង្វឹករបស់អ្នក។";
  } else {
    text += "បានភ្ជាប់៖\n";
    for (const a of accounts) {
      text += `• <b>${esc(a.username)}</b> — ${ROLE_KM[a.role] || a.role}${a.team ? ` · ${esc(a.team)}` : ""}\n`;
      rows.push([
        { text: `🔑 លេខសម្ងាត់ថ្មី · ${a.username}`.slice(0, 60), callback_data: `rp:${a._id}` },
        { text: "✂️ ផ្ដាច់", callback_data: `ul:${a._id}` },
      ]);
    }
  }
  rows.push([{ text: accounts.length ? "➕ ភ្ជាប់គណនីមួយទៀត" : "🔗 ភ្ជាប់គណនី", callback_data: "lk" }]);
  return send(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function startAccountLink(chatId, from) {
  const cart = await getCart(from, chatId);
  if (cart.linkLockedUntil && cart.linkLockedUntil > new Date()) {
    return send(chatId, "⛔ បញ្ចូលលេខកូដខុសច្រើនដងពេក។ សូមព្យាយាមម្ដងទៀតក្រោយ ១ ម៉ោង។");
  }
  cart.step = "acct_user";
  cart.linkUsername = "";
  await cart.save();
  return send(chatId, "👤 សូមវាយ <b>username</b> (ឈ្មោះអ្នកប្រើ) របស់អ្នកលើវេបសាយ:", {
    reply_markup: { force_reply: true, input_field_placeholder: "username" },
  });
}

async function finishLink(chatId, account, linkRow) {
  account.telegramChatId = chatId;
  await account.save();
  if (linkRow) await AccountLinkCode.deleteMany({ account: account._id });
  await send(
    chatId,
    `✅ បានភ្ជាប់គណនី <b>${esc(account.username)}</b> (${ROLE_KM[account.role] || account.role}) ហើយ!\n\n` +
      "• 🔔 ព័ត៌មាន/ការជូនដំណឹងពីវេបសាយ នឹងមកទីនេះ\n• 🔑 ភ្លេចលេខសម្ងាត់? ចុច <b>" + BTN.account + "</b> → លេខសម្ងាត់ថ្មី",
    { reply_markup: mainKeyboard }
  );
}

// step "acct_code": check username + code.
async function checkLinkCode(cart, msg, code) {
  const chatId = cart.chatId;
  // Don't leave the code sitting in the chat.
  tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
  const account = await Admin.findOne({ username: cart.linkUsername });
  const row = account ? await AccountLinkCode.findOne({ account: account._id, code: String(code).replace(/\s/g, "") }) : null;
  if (!row) {
    cart.linkFails = (cart.linkFails || 0) + 1;
    const left = MAX_LINK_FAILS - cart.linkFails;
    if (left <= 0) {
      cart.linkFails = 0;
      cart.linkLockedUntil = new Date(Date.now() + 60 * 60 * 1000);
      cart.step = "";
      await cart.save();
      return send(chatId, "⛔ username ឬលេខកូដមិនត្រឹមត្រូវច្រើនដងពេក។ សូមព្យាយាមម្ដងទៀតក្រោយ ១ ម៉ោង។", { reply_markup: mainKeyboard });
    }
    await cart.save();
    return send(chatId, `⚠️ username ឬលេខកូដមិនត្រឹមត្រូវ ឬផុតកំណត់ (លេខកូដប្រើបាន ១៥ នាទី)។ សូមវាយលេខកូដម្ដងទៀត (នៅសល់ ${left} ដង) ឬ /cancel។`);
  }
  cart.step = "";
  cart.linkFails = 0;
  cart.linkUsername = "";
  await cart.save();
  return finishLink(chatId, account, row);
}

// t.me/<bot>?start=acct_<token> — one tap from the website.
async function linkByToken(chatId, token) {
  const row = await AccountLinkCode.findOne({ token });
  if (!row) return send(chatId, "⚠️ តំណនេះផុតកំណត់ ឬប្រើរួចហើយ។ សូមបង្កើតលេខកូដថ្មីលើវេបសាយ។", { reply_markup: mainKeyboard });
  const account = await Admin.findById(row.account);
  if (!account) return;
  return finishLink(chatId, account, row);
}

// Only from the chat that is linked to that account.
async function linkedAccount(chatId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Admin.findOne({ _id: id, telegramChatId: chatId });
}

async function resetPasswordHere(chatId, id) {
  const account = await linkedAccount(chatId, id);
  if (!account) return send(chatId, "⚠️ គណនីនេះមិនបានភ្ជាប់ជាមួយ Telegram នេះទេ។");
  const temp = String(require("crypto").randomInt(100000, 1000000));
  account.password = temp;
  account.mustChangePassword = true;
  await account.save();
  return send(
    chatId,
    `🔑 លេខសម្ងាត់បណ្ដោះអាសន្នសម្រាប់ <b>${esc(account.username)}</b>:\n\n<code>${temp}</code>\n\n` +
      "ចូលវេបសាយដោយប្រើលេខនេះ ហើយប្រព័ន្ធនឹងឱ្យអ្នកដាក់លេខសម្ងាត់ថ្មី។ កុំប្រាប់អ្នកផ្សេង 🔒",
    { reply_markup: mainKeyboard }
  );
}

// ---------------- Live chat (customer ⇄ Admin) ----------------

async function chatAdmins() {
  return Admin.find({ role: "ADMIN", telegramChatId: { $nin: [null, ""] } }).select("telegramChatId").lean();
}

// Copy a customer's message (text, photo, voice, sticker…) to every linked
// Admin, with a header saying who it's from. Returns true if it reached anyone.
async function relayToAdmins(msg, cart) {
  const chatId = String(msg.chat.id);
  const admins = (await chatAdmins()).filter((a) => String(a.telegramChatId) !== chatId);
  if (!admins.length) return false;
  const who = [cart.name || cart.firstName || "អតិថិជន", msg.from?.username ? `@${msg.from.username}` : ""].filter(Boolean).join(" ");
  let reached = false;
  for (const a of admins) {
    const to = String(a.telegramChatId);
    const head = await send(to, `💬 <b>សារពី ${esc(who)}</b>${cart.phone ? ` · 📱 ${esc(cart.phone)}` : ""}\n↩️ <i>ចុច Reply លើសារនេះ ដើម្បីឆ្លើយទៅអតិថិជន</i>`);
    const copy = await tg("copyMessage", { chat_id: to, from_chat_id: chatId, message_id: msg.message_id });
    const ids = [head?.message_id, copy?.message_id].filter(Boolean);
    if (ids.length) reached = true;
    await BotRelay.insertMany(ids.map((id) => ({ adminChatId: to, adminMessageId: id, customerChatId: chatId })));
  }
  return reached;
}

// An Admin replied (Telegram "Reply") to a relayed message or to an order
// alert → send their answer to that customer. Returns true if handled.
async function handleAdminReply(msg) {
  const chatId = String(msg.chat.id);
  const replied = msg.reply_to_message?.message_id;
  if (!replied) return false;
  let target = (await BotRelay.findOne({ adminChatId: chatId, adminMessageId: replied }).lean())?.customerChatId;
  if (!target) {
    const order = await BotOrder.findOne({ adminMessages: { $elemMatch: { chatId, messageId: replied } } }).lean();
    target = order?.chatId;
  }
  if (!target) return false;
  if (!(await Admin.exists({ role: "ADMIN", telegramChatId: chatId }))) return false;
  const sent = await tg("copyMessage", { chat_id: target, from_chat_id: chatId, message_id: msg.message_id });
  await send(chatId, sent ? "✅ បានផ្ញើទៅអតិថិជន" : "⚠️ ផ្ញើមិនបាន — អតិថិជនប្រហែលបានបិទ (block) bot", {
    reply_to_message_id: msg.message_id,
  });
  return true;
}

// ---------------- Router ----------------

// In a group: an Admin types /paygroup to make it the group where "💰 paid"
// notices are posted, or /verify … to check a payment there.
async function groupCommand(msg, text) {
  const m = /^\/(paygroup|verify)(@\w+)?(?:\s+(.*))?$/i.exec(text);
  if (!m) return;
  const admin = await Admin.findOne({ role: "ADMIN", telegramChatId: String(msg.from?.id) });
  if (!admin) return send(msg.chat.id, "⚠️ មានតែ Admin ដែលបានភ្ជាប់ Telegram ទេ ទើបប្រើបាន។");
  if (m[1].toLowerCase() === "paygroup") {
    const PaySettings = require("../models/PaySettings");
    await PaySettings.updateOne({ key: "shop" }, { $set: { groupChatId: String(msg.chat.id), groupTitle: msg.chat.title || "" } }, { upsert: true });
    return send(msg.chat.id, "✅ ក្រុមនេះនឹងទទួលដំណឹង «💰 បានទទួលលុយ» ពីការកម្មង់ដែលបង់តាម KHQR។");
  }
  const r = await payments.verify(m[3] || "").catch((e) => ({ text: `⚠️ ${esc(e.message)}` }));
  return send(msg.chat.id, r.text);
}

async function onMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || "").trim();
  // Groups: only Admin commands (/paygroup, /verify). The shop itself works
  // in private chats only.
  if (msg.chat.type !== "private") return groupCommand(msg, text);

  // Admin: /verify BO-0012 | md5 | bank hash
  if (/^\/verify(@\w+)?(\s|$)/i.test(text)) {
    if (!(await isOrderAdmin(msg.from.id))) return send(chatId, "មិនមានសិទ្ធិ");
    const r = await payments.verify(text.split(/\s+/).slice(1).join(" ")).catch((e) => ({ text: `⚠️ ${esc(e.message)}` }));
    return send(chatId, r.text);
  }

  // Admin answering a customer (Reply on a relayed message / order alert).
  if (msg.reply_to_message && (await handleAdminReply(msg))) return;

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] || "";
    if (payload.startsWith("link_")) return linkAdmin(chatId, payload.slice(5), msg.from);
    if (payload.startsWith("acct_")) return linkByToken(chatId, payload.slice(5));
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
  if (text === "/account" || text === BTN.account) return accountMenu(chatId);
  if (text === "/link") return startAccountLink(chatId, msg.from);

  const cart = await getCart(msg.from, chatId);
  if (text === "/cancel" || text === "❌ បោះបង់") {
    cart.step = "";
    await cart.save();
    return send(chatId, "បានបោះបង់។ ទំនិញនៅក្នុងកន្ត្រកនៅដដែល។", { reply_markup: mainKeyboard });
  }
  if (cart.step === "acct_user" && text) {
    cart.linkUsername = text.slice(0, 60);
    cart.step = "acct_code";
    await cart.save();
    return send(chatId, "🔢 សូមវាយ <b>លេខកូដ ៦ ខ្ទង់</b>:", { reply_markup: { force_reply: true, input_field_placeholder: "123456" } });
  }
  if (cart.step === "acct_code" && text) return checkLinkCode(cart, msg, text);
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
  // Anything else (a question, a photo, a voice note…): pass it to the shop.
  if (!text.startsWith("/")) {
    const reached = await relayToAdmins(msg, cart);
    if (reached) {
      const quiet = cart.lastChatAt && Date.now() - new Date(cart.lastChatAt).getTime() < 30 * 60 * 1000;
      cart.lastChatAt = new Date();
      await cart.save();
      if (!quiet) return send(chatId, "✅ បានផ្ញើសាររបស់អ្នកទៅហាងហើយ — យើងនឹងឆ្លើយតបនៅទីនេះឆាប់ៗ 🙏", { reply_markup: mainKeyboard });
      return;
    }
  }
  return send(chatId, `ចុច <b>${BTN.shop}</b> ដើម្បីមើលទំនិញ ឬ <b>${BTN.cart}</b> ដើម្បីមើលកន្ត្រក។`, {
    reply_markup: { inline_keyboard: [[openShopButton()]] },
  });
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
    case "lk":
      await ack();
      return startAccountLink(chatId, cb.from);
    case "rp": {
      // Ask first — a new password replaces the current one.
      const account = await linkedAccount(chatId, a);
      if (!account) return ack("មិនមានសិទ្ធិ", true);
      await ack();
      return send(chatId, `🔑 កំណត់លេខសម្ងាត់ថ្មីសម្រាប់ <b>${esc(account.username)}</b>? លេខសម្ងាត់ចាស់នឹងឈប់ប្រើបាន។`, {
        reply_markup: { inline_keyboard: [[{ text: "✅ បាទ/ចាស កំណត់ថ្មី", callback_data: `rpy:${a}` }, { text: "❌ ទេ", callback_data: "noop" }]] },
      });
    }
    case "rpy":
      await ack();
      if (msgId) tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      return resetPasswordHere(chatId, a);
    case "ul": {
      const account = await linkedAccount(chatId, a);
      if (!account) return ack("មិនមានសិទ្ធិ", true);
      account.telegramChatId = "";
      await account.save();
      await ack("✂️ បានផ្ដាច់");
      return accountMenu(chatId);
    }
    case "pc": {
      // Customer: "I've paid — check"
      const order = await BotOrder.findById(mongoose.isValidObjectId(a) ? a : null);
      if (!order || order.chatId !== chatId) return ack();
      if (order.payment?.status === "paid") return ack("✅ បានបង់រួចហើយ");
      const r = await payments.runPaymentChecks({ orderIds: [order._id] });
      if (r.paid.length) return ack("✅ បានទទួលការបង់ប្រាក់ — សូមអរគុណ!");
      if (r.error) return ack("⏳ មិនទាន់អាចពិនិត្យបានទេ — ហាងនឹងពិនិត្យ ហើយបញ្ជាក់ជូនឆាប់ៗ", true);
      return ack("⏳ មិនទាន់ឃើញការបង់ប្រាក់ទេ។ បើទើបបង់ សូមរង់ចាំបន្តិច រួចចុចម្ដងទៀត។", true);
    }
    case "pn": {
      // Customer: new QR after the old one expired
      const order = await BotOrder.findById(mongoose.isValidObjectId(a) ? a : null);
      if (!order || order.chatId !== chatId) return ack();
      if (order.status !== "pending" || order.payment?.status === "paid") return ack("ការកម្មង់នេះលែងត្រូវការបង់ទៀតហើយ", true);
      await ack();
      if (msgId) tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      const p = await payments.offerPayment(order);
      if (!p) return send(chatId, `សូមទាក់ទងហាង 📞 ${SHOP_INFO.phone} ដើម្បីបង់ប្រាក់។`);
      return;
    }
    case "pv": {
      // Admin: check this order's payment now
      const admin = await isOrderAdmin(cb.from.id);
      if (!admin) return ack("មិនមានសិទ្ធិ", true);
      const order = await BotOrder.findById(mongoose.isValidObjectId(a) ? a : null);
      if (!order) return ack();
      const r = await payments.verify(order.orderNo).catch((e) => ({ text: e.message }));
      return ack(r.text.replace(/<[^>]+>/g, "").slice(0, 190), true);
    }
    case "pm": {
      // Admin: mark paid by hand (saw the money in the bank app) — ask first
      const admin = await isOrderAdmin(cb.from.id);
      if (!admin) return ack("មិនមានសិទ្ធិ", true);
      const order = await BotOrder.findById(mongoose.isValidObjectId(a) ? a : null);
      if (!order) return ack();
      await ack();
      return send(chatId, `💰 បញ្ជាក់ថាបានទទួលលុយ <b>${usd(order.total)}</b> សម្រាប់ ${order.orderNo} ពិតមែន? (បានឃើញក្នុងកម្មវិធីធនាគារ)`, {
        reply_markup: { inline_keyboard: [[{ text: "✅ បាទ/ចាស បានទទួល", callback_data: `pmy:${a}` }, { text: "❌ ទេ", callback_data: "noop" }]] },
      });
    }
    case "pmy": {
      const admin = await isOrderAdmin(cb.from.id);
      if (!admin) return ack("មិនមានសិទ្ធិ", true);
      if (msgId) tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      const r = await payments.markPaid(a, { by: admin._id });
      return ack(r.already ? "បានកត់ថាបង់រួចហើយ" : "✅ បានកត់ថាបានបង់");
    }
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

module.exports = { handleUpdate, confirmOrder, rejectOrder, placeWebAppOrder, webAppProfile, BTN, usd, riel, money };
