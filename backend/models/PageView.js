const mongoose = require("mongoose");

// One row per page opened on the website (sent by the frontend tracker on
// every route change). Used by the admin Analytics page to answer:
//   – how many people visited (visitorId = random id kept in the browser)
//   – from where (country/city, looked up from the IP address)
//   – on which device / OS / browser
//   – and, when the visitor is signed in, which user account it was.
// Location from an IP address is approximate (usually right for country,
// often only the nearest big city for province-level).
const pageViewSchema = new mongoose.Schema(
  {
    path: { type: String, required: true },
    visitorId: { type: String, required: true },
    referrer: { type: String, default: "" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    username: { type: String, default: null },
    role: { type: String, default: null },
    ip: { type: String },
    country: { type: String, default: "Unknown" },
    countryCode: { type: String, default: "" },
    region: { type: String, default: "" },
    city: { type: String, default: "Unknown" },
    device: { type: String, default: "desktop" }, // mobile | tablet | desktop
    os: { type: String, default: "Other" },
    browser: { type: String, default: "Other" },
    screen: { type: String, default: "" },
    language: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pageViewSchema.index({ visitorId: 1, createdAt: -1 });
pageViewSchema.index({ user: 1, createdAt: -1 });
// Keep the free MongoDB Atlas tier from filling up: views older than one
// year are deleted automatically by MongoDB.
pageViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600, name: "ttl_1y" });

module.exports = mongoose.model("PageView", pageViewSchema);
