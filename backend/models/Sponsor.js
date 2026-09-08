const mongoose = require("mongoose");

// A club/team logo shown in the public "Trusted by" strip (Landing + About
// pages). Admin-managed via /api/sponsors so logos can be added, renamed,
// reordered, or removed without touching code.
const sponsorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String, required: true },
    logoPublicId: { type: String },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sponsor", sponsorSchema);
