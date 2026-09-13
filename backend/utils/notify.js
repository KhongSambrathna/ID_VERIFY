const Admin = require("../models/Admin");

// Best-effort Telegram notifications over the Bot API's plain HTTPS
// endpoint (built-in `fetch` — no extra npm dependency to install). A
// missing token or chat id just means that message is skipped; nothing
// here ever throws into the caller, so a notification hiccup can never
// break the actual save/approve/etc. it's attached to.
//
// One-time setup on the club's side (not something this code can do for
// you):
//   1. In Telegram, message @BotFather, send /newbot, and follow the
//      prompts to get a bot token.
//   2. Set TELEGRAM_BOT_TOKEN to that token in the backend's environment
//      variables (Render → your service → Environment).
//   3. Each Admin/Head Coach who wants alerts opens a chat with the new
//      bot and sends it any message once, then looks up their own numeric
//      chat id (e.g. by forwarding that message to @userinfobot) and saves
//      it on their account's "Telegram chat ID" field (Manage users page).
async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("Telegram send failed:", res.status, body);
    }
  } catch (err) {
    console.warn("Telegram send failed:", err.message);
  }
}

// Every Admin account that has a telegramChatId saved.
async function notifyAdmins(text) {
  try {
    const admins = await Admin.find({ role: "ADMIN", telegramChatId: { $nin: ["", null] } }).select(
      "telegramChatId"
    );
    await Promise.all(admins.map((a) => sendTelegramMessage(a.telegramChatId, text)));
  } catch (err) {
    console.warn("notifyAdmins failed:", err.message);
  }
}

// Every Head Coach account for one team that has a telegramChatId saved.
async function notifyTeamCoaches(team, text) {
  if (!team) return;
  try {
    const coaches = await Admin.find({
      role: "HEAD_COACH",
      team,
      telegramChatId: { $nin: ["", null] },
    }).select("telegramChatId");
    await Promise.all(coaches.map((c) => sendTelegramMessage(c.telegramChatId, text)));
  } catch (err) {
    console.warn("notifyTeamCoaches failed:", err.message);
  }
}

module.exports = { sendTelegramMessage, notifyAdmins, notifyTeamCoaches };
