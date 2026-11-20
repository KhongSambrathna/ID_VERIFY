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
    step: { type: String, enum: ["", "name", "phone", "note", "confirm"], default: "" },
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
  AlertLog: mongoose.model("AlertLog", alertLogSchema),
};
