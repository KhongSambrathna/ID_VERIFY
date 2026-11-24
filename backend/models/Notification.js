const mongoose = require("mongoose");

// In-website notifications (the 🔔 bell in the top bar). One row per
// person per notice. Old ones are removed automatically after 90 days.
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    text: { type: String, required: true }, // one or more lines; the first is the headline
    link: { type: String, default: "" }, // page to open when clicked (e.g. "/admin?tab=pendingNew")
    kind: { type: String, default: "" }, // approval, payment, order, tournament, jersey…
    readAt: { type: Date, default: null },
    // Optional ✅ / ❌ buttons right on the notice (e.g. a coach asked to
    // remove a player → the Admin confirms or declines from the bell).
    action: {
      type: { type: String, default: "" }, // "assignment" | "withdrawal" | "friend"
      friendshipId: String,
      athleteId: String,
      assignmentId: String,
      tournamentId: String,
      registrationId: String,
    },
    // Same request sent to several people shares one ref — once anyone
    // handles it (here or on its normal page), everyone's buttons close.
    ref: { type: String, default: "" },
    resolved: {
      choice: { type: String, default: "" }, // "approve" | "reject"
      by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      at: { type: Date, default: null },
    },
    createdAt: { type: Date, default: Date.now, expires: 90 * 24 * 3600 },
  },
  { versionKey: false }
);
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ ref: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
