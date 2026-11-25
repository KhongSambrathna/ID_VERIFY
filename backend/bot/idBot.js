// Countryside Football ID — Telegram bot (accounts only).
//
// Players, coaches, referees and Admins link this chat to their website
// account (username + 6-digit code from Settings, or a one-tap link), then:
//   • the site's Telegram notices come here (fees owed, approvals, payments…)
//   • they can set a new password here when they forget it.
// Admins can also link from the Telegram page (t.me/<bot>?start=link_<code>).
//
// The shop has its own bot now (shop-project). Telegram calls
// POST /api/telegram/webhook/<secret>; handleUpdate() does the work.
//
// Bot សម្រាប់គណនី ID — ភ្ជាប់គណនី និងប្តូរលេខសម្ងាត់
const crypto = require("crypto");
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const { TelegramLink, AccountLinkCode, IdBotChat } = require("../models/TelegramBot");
const { tg, esc } = require("../utils/telegramApi");

const BTN = { account: "👤 គណនីរបស់ខ្ញុំ", help: "❓ ជំនួយ" };
const mainKeyboard = {
  keyboard: [[{ text: BTN.account }, { text: BTN.help }]],
  resize_keyboard: true,
  is_persistent: true,
};
const ROLE_KM = { ADMIN: "Admin", HEAD_COACH: "គ្រូបង្វឹក", PLAYER: "កីឡាករ", REFEREE: "អាជ្ញាកណ្ដាល" };
const MAX_LINK_FAILS = 5;

const send = (chatId, text, extra = {}) =>
  tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

async function chatState(chatId) {
  let s = await IdBotChat.findOne({ chatId: String(chatId) });
  if (!s) s = await IdBotChat.create({ chatId: String(chatId) });
  return s;
}

function welcome(chatId, name) {
  return send(
    chatId,
    `សួស្តី ${esc(name || "")} 👋\n\nនេះជា bot របស់ <b>Countryside Football ID</b>។\n\n` +
      "ភ្ជាប់គណនីរបស់អ្នក ដើម្បី៖\n• 🔔 ទទួលការជូនដំណឹងពីវេបសាយ (ប្រាក់ត្រូវបង់ ការអនុម័ត…)\n• 🔑 កំណត់លេខសម្ងាត់ថ្មីនៅទីនេះ ពេលភ្លេច\n\n" +
      `ចុច <b>${BTN.account}</b> ដើម្បីចាប់ផ្តើម។`,
    { reply_markup: mainKeyboard }
  );
}

function help(chatId) {
  return send(
    chatId,
    "❓ <b>ជំនួយ</b>\n\n" +
      `• <b>${BTN.account}</b> — មើល/ភ្ជាប់គណនី ប្តូរលេខសម្ងាត់\n` +
      "• លេខកូដ ៦ ខ្ទង់ យកពីទំព័រ ការកំណត់ (Settings) លើវេបសាយ ឬសុំពី Admin / គ្រូបង្វឹក\n" +
      "• /id — មើល Chat ID របស់អ្នក",
    { reply_markup: mainKeyboard }
  );
}

// ---------------- Admin link from the website's Telegram page ----------------

async function linkAdmin(chatId, code) {
  const link = await TelegramLink.findOne({ code });
  if (!link) return send(chatId, "⚠️ តំណនេះផុតកំណត់ ឬប្រើរួចហើយ។ សូមចុច «ភ្ជាប់ Telegram» ម្ដងទៀតនៅលើវេបសាយ។");
  const admin = await Admin.findById(link.admin);
  await link.deleteOne();
  if (!admin) return;
  admin.telegramChatId = chatId;
  await admin.save();
  return send(chatId, `✅ បានភ្ជាប់ Telegram ទៅគណនី <b>${esc(admin.username)}</b> ហើយ! ការជូនដំណឹងពីវេបសាយនឹងមកទីនេះ 🔔`, {
    reply_markup: mainKeyboard,
  });
}

// ---------------- Website accounts (link · reset password) ----------------

async function accountMenu(chatId) {
  const accounts = await Admin.find({ telegramChatId: chatId }).select("username role team").lean();
  let text = "👤 <b>គណនីលើវេបសាយ</b>\n\n";
  const rows = [];
  if (!accounts.length) {
    text +=
      "Telegram នេះមិនទាន់ភ្ជាប់គណនីណាទេ។\n\n" +
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

async function startAccountLink(chatId) {
  const st = await chatState(chatId);
  if (st.linkLockedUntil && st.linkLockedUntil > new Date()) {
    return send(chatId, "⛔ បញ្ចូលលេខកូដខុសច្រើនដងពេក។ សូមព្យាយាមម្ដងទៀតក្រោយ ១ ម៉ោង។");
  }
  st.step = "acct_user";
  st.linkUsername = "";
  await st.save();
  return send(chatId, "👤 សូមវាយ <b>username</b> (ឈ្មោះអ្នកប្រើ) របស់អ្នកលើវេបសាយ:", {
    reply_markup: { force_reply: true, input_field_placeholder: "username" },
  });
}

async function finishLink(chatId, account) {
  account.telegramChatId = chatId;
  await account.save();
  await AccountLinkCode.deleteMany({ account: account._id });
  return send(
    chatId,
    `✅ បានភ្ជាប់គណនី <b>${esc(account.username)}</b> (${ROLE_KM[account.role] || account.role}) ហើយ!\n\n` +
      `• 🔔 ការជូនដំណឹងពីវេបសាយ នឹងមកទីនេះ\n• 🔑 ភ្លេចលេខសម្ងាត់? ចុច <b>${BTN.account}</b> → លេខសម្ងាត់ថ្មី`,
    { reply_markup: mainKeyboard }
  );
}

// step "acct_code": check username + code
async function checkLinkCode(st, msg, code) {
  const chatId = st.chatId;
  tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => {}); // don't leave the code in the chat
  const account = await Admin.findOne({ username: st.linkUsername });
  const row = account ? await AccountLinkCode.findOne({ account: account._id, code: String(code).replace(/\s/g, "") }) : null;
  if (!row) {
    st.linkFails = (st.linkFails || 0) + 1;
    const left = MAX_LINK_FAILS - st.linkFails;
    if (left <= 0) {
      st.linkFails = 0;
      st.linkLockedUntil = new Date(Date.now() + 60 * 60 * 1000);
      st.step = "";
      await st.save();
      return send(chatId, "⛔ username ឬលេខកូដមិនត្រឹមត្រូវច្រើនដងពេក។ សូមព្យាយាមម្ដងទៀតក្រោយ ១ ម៉ោង។", { reply_markup: mainKeyboard });
    }
    await st.save();
    return send(chatId, `⚠️ username ឬលេខកូដមិនត្រឹមត្រូវ ឬផុតកំណត់ (លេខកូដប្រើបាន ១៥ នាទី)។ សូមវាយលេខកូដម្ដងទៀត (នៅសល់ ${left} ដង) ឬ /cancel។`);
  }
  st.step = "";
  st.linkFails = 0;
  st.linkUsername = "";
  await st.save();
  return finishLink(chatId, account);
}

// t.me/<bot>?start=acct_<token> — one tap from the website
async function linkByToken(chatId, token) {
  const row = await AccountLinkCode.findOne({ token });
  if (!row) return send(chatId, "⚠️ តំណនេះផុតកំណត់ ឬប្រើរួចហើយ។ សូមបង្កើតលេខកូដថ្មីលើវេបសាយ។", { reply_markup: mainKeyboard });
  const account = await Admin.findById(row.account);
  if (!account) return;
  return finishLink(chatId, account);
}

// only from the chat that is linked to that account
async function linkedAccount(chatId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Admin.findOne({ _id: id, telegramChatId: chatId });
}

async function resetPasswordHere(chatId, id) {
  const account = await linkedAccount(chatId, id);
  if (!account) return send(chatId, "⚠️ គណនីនេះមិនបានភ្ជាប់ជាមួយ Telegram នេះទេ។");
  const temp = String(crypto.randomInt(100000, 1000000));
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

// ---------------- Router ----------------

async function onMessage(msg) {
  if (msg.chat.type !== "private") return; // accounts only work in a private chat
  const chatId = String(msg.chat.id);
  const text = (msg.text || "").trim();

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] || "";
    if (payload.startsWith("link_")) return linkAdmin(chatId, payload.slice(5));
    if (payload.startsWith("acct_")) return linkByToken(chatId, payload.slice(5));
    const st = await chatState(chatId);
    st.step = "";
    await st.save();
    return welcome(chatId, msg.from?.first_name);
  }
  if (text === "/id") return send(chatId, `🆔 Chat ID: <code>${chatId}</code>`);
  if (text === "/account" || text === BTN.account) return accountMenu(chatId);
  if (text === "/link") return startAccountLink(chatId);
  if (text === "/help" || text === BTN.help) return help(chatId);

  const st = await chatState(chatId);
  if (text === "/cancel" || text === "❌ បោះបង់") {
    st.step = "";
    await st.save();
    return send(chatId, "បានបោះបង់។", { reply_markup: mainKeyboard });
  }
  if (st.step === "acct_user" && text) {
    st.linkUsername = text.slice(0, 60);
    st.step = "acct_code";
    await st.save();
    return send(chatId, "🔢 សូមវាយ <b>លេខកូដ ៦ ខ្ទង់</b>:", { reply_markup: { force_reply: true, input_field_placeholder: "123456" } });
  }
  if (st.step === "acct_code" && text) return checkLinkCode(st, msg, text);
  return help(chatId);
}

async function onCallback(cb) {
  const chatId = String(cb.message?.chat?.id || cb.from.id);
  const msgId = cb.message?.message_id;
  const [cmd, a] = (cb.data || "").split(":");
  const ack = (text, alert) => tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: Boolean(alert) });

  switch (cmd) {
    case "lk":
      await ack();
      return startAccountLink(chatId);
    case "rp": {
      // ask first — a new password replaces the current one
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

module.exports = { handleUpdate };
