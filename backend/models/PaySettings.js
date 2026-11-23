const mongoose = require("mongoose");

// Shop KHQR payment settings (one record for the whole shop).
//
//   bakongAccountId → where the money goes, e.g. "brathna@aclb" or a Bakong
//                     app wallet. Every bank app in Cambodia can pay it.
//   token / tokenEmail → Bakong Open API (api-bakong.nbc.gov.kh) developer
//                     token, used to check "has this QR been paid?". It
//                     lasts ~90 days; with tokenEmail set it renews itself.
//   groupChatId     → a Telegram group where the bot posts "💰 paid" notices
//                     (set by typing /paygroup in that group).
const paySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "shop", unique: true },
    enabled: { type: Boolean, default: false },
    bakongAccountId: { type: String, trim: true, default: "" },
    merchantName: { type: String, trim: true, default: "BRATHNA SPORT SHOP" },
    merchantCity: { type: String, trim: true, default: "Siem Reap" },
    currency: { type: String, enum: ["USD", "KHR"], default: "USD" },
    expiresMinutes: { type: Number, min: 3, max: 1440, default: 15 },
    token: { type: String, default: "" },
    tokenEmail: { type: String, trim: true, default: "" },
    tokenRenewedAt: { type: Date, default: null },
    // Confirm the order (make the paid invoice, cut stock) as soon as the
    // money is verified. Off → Admin still presses ✅ but sees "paid".
    autoConfirm: { type: Boolean, default: true },
    groupChatId: { type: String, default: "" },
    groupTitle: { type: String, default: "" },
    lastCheckError: { type: String, default: "" },
    lastCheckAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaySettings", paySettingsSchema);
