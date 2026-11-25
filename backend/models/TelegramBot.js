const mongoose = require("mongoose");

// What the ID Telegram bot keeps (accounts only — the shop bot lives in the
// shop app, with its own carts and orders).

// One-time codes for an Admin's "link my Telegram" (t.me/<bot>?start=link_<code>).
// The shop app uses the same collection for its own bot links.
const linkSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 30 },
});

// One-time code for linking ANY website account (Admin, Head Coach, Player,
// Referee) to Telegram from inside the bot: the person types their
// username + this 6-digit code, or taps the t.me/<bot>?start=acct_<token>
// link. Made by the person (Settings), by Admin (any account) or by a Head
// Coach (their own team's player accounts). Expires after 15 minutes.
const accountLinkSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
  code: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  createdAt: { type: Date, default: Date.now, expires: 60 * 15 },
});

// Per-chat state of the ID bot (what it is waiting for while linking).
const idBotChatSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, unique: true },
    step: { type: String, default: "" },
    linkUsername: { type: String, default: "" },
    linkFails: { type: Number, default: 0 },
    linkLockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = {
  TelegramLink: mongoose.model("TelegramLink", linkSchema),
  AccountLinkCode: mongoose.model("AccountLinkCode", accountLinkSchema),
  IdBotChat: mongoose.model("IdBotChat", idBotChatSchema),
};
