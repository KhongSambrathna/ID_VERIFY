const mongoose = require("mongoose");

// One row per hit on the public verify endpoint (whatever a QR code or
// shared link opens) — timestamp + best-effort IP/device only. That page
// has no login, so "who" scanned can never really be known; this exists as
// extra evidence against impersonation (a pattern of scans from far away,
// or none at all before a match-day dispute), not an identity log.
const scanLogSchema = new mongoose.Schema(
  {
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", required: true },
    verifyId: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: "scannedAt", updatedAt: false } }
);

scanLogSchema.index({ athlete: 1, scannedAt: -1 });

module.exports = mongoose.model("ScanLog", scanLogSchema);
