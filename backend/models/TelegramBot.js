const mongoose = require("mongoose");

// Everything the Telegram shop bot keeps.

// One shopping cart per Telegram chat (a customer talking to the bot).
// `step` remembers what the bot is waiting for during checkout.
const cartSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, unique: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        qty: { type: Number, min: 1, required: true },
      },
    ],
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    step: { type: String, enum: ["", "name", "phone", "note", "confirm", "acct_user", "acct_code"], default: "" },
    // Linking a website account from inside the bot (👤 គណនីរបស់ខ្ញុំ):
    // the username typed so far, and a lock after too many wrong codes.
    linkUsername: { type: String, default: "" },
    linkFails: { type: Number, default: 0 },
    linkLockedUntil: { type: Date, default: null },
    // Last time this customer's chat message was passed on to the shop
    // (so the "message sent" note isn't repeated on every message).
    lastChatAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// An order placed in the bot. The Admin confirms it (→ a real invoice, stock
// is cut) or rejects it, from Telegram or from the website.
const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true }, // "BO-0001"
    chatId: { type: String, required: true, index: true },
    username: { type: String, default: "" },
    customer: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
    },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: String,
        unit: String,
        qty: Number,
        unitPrice: Number, // USD, after any sale / wholesale price
        listPrice: Number,
      },
    ],
    total: { type: Number, default: 0 }, // USD
    note: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["pending", "confirmed", "rejected", "cancelled"], default: "pending", index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    handledAt: { type: Date, default: null },
    // KHQR payment (utils/orderPayments.js). status:
    //   none    → KHQR off when ordered (pay on delivery / by arrangement)
    //   unpaid  → QR sent, waiting for the money
    //   paid    → verified with the Bakong API (or marked by hand by Admin)
    //   expired → QR timed out unpaid (customer can ask for a new one)
    payment: {
      status: { type: String, enum: ["none", "unpaid", "paid", "expired"], default: "none", index: true },
      method: { type: String, default: "" }, // "khqr" | "manual"
      qr: { type: String, default: "" },
      md5: { type: String, default: "", index: true },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "USD" },
      expiresAt: { type: Date, default: null },
      paidAt: { type: Date, default: null },
      hash: { type: String, default: "" }, // bank transaction hash
      fromAccount: { type: String, default: "" },
      markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      qrMessageId: { type: Number, default: null }, // the QR photo sent to the customer
    },
    // Admin alert messages about this order, so they can be updated after
    // it's confirmed/rejected somewhere else.
    adminMessages: [{ _id: false, chatId: String, messageId: Number }],
  },
  { timestamps: true }
);

// One-time codes for "link my Telegram" (t.me/<bot>?start=link_<code>).
const linkSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 30 },
});

// Remembers which alerts were already sent, so each goes out once.
// Entries with expiresAt are cleaned up by MongoDB after that time.
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

// Live chat: a customer's message copied into an Admin's Telegram. When the
// Admin presses Reply on that copy, the bot looks it up here and sends the
// answer to the right customer. Kept 30 days.
const relaySchema = new mongoose.Schema({
  adminChatId: { type: String, required: true },
  adminMessageId: { type: Number, required: true },
  customerChatId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});
relaySchema.index({ adminChatId: 1, adminMessageId: 1 });

const alertLogSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  at: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
});
alertLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  BotCart: mongoose.model("BotCart", cartSchema),
  BotOrder: mongoose.model("BotOrder", orderSchema),
  TelegramLink: mongoose.model("TelegramLink", linkSchema),
  BotRelay: mongoose.model("BotRelay", relaySchema),
  AccountLinkCode: mongoose.model("AccountLinkCode", accountLinkSchema),
  AlertLog: mongoose.model("AlertLog", alertLogSchema),
};
