const mongoose = require("mongoose");

const athleteSchema = new mongoose.Schema(
  {
    verifyId: {
      // short, printable ID used on the card / QR code / public verify URL
      // e.g. "001-100-2991" — assigned in the controller via generateShortId()
      type: String,
      unique: true,
    },
    fullName: { type: String, required: true },
    khmerName: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    team: { type: String },
    role: {
      // athlete's role/position
      type: String,
      enum: ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"],
      default: "PLAYER",
    },
    address: { type: String },
    isAvailable: {
      // whether the athlete is currently available to play (not injured/suspended/etc.)
      type: Boolean,
      default: true,
    },
    photoUrl: { type: String }, // Cloudinary secure_url of the uploaded photo
    photoPublicId: { type: String }, // Cloudinary public_id (needed to delete/replace it)
    supportingDocuments: [
      {
        label: { type: String }, // e.g. "National ID copy", "Birth certificate"
        fileUrl: { type: String }, // Cloudinary secure_url
        publicId: { type: String }, // Cloudinary public_id
        resourceType: { type: String, default: "image" }, // "image" or "raw" — needed to delete correctly
      },
    ],
    status: {
      // verification workflow state
      type: String,
      enum: ["unverified", "verified"],
      default: "unverified",
    },
    approvalStatus: {
      // Publishing gate for Head-Coach-submitted data. Records an Admin
      // creates/edits stay "approved" (immediately public) as before. Any
      // Add or Update made by a Head Coach flips this to "pending" — hidden
      // from public search/verify — until an Admin reviews it and approves
      // (PUT /api/athletes/:id/approve). This is separate from `status`
      // above, which is the athlete's own ID-verification badge, not a
      // data-publishing gate.
      type: String,
      enum: ["pending", "approved"],
      default: "approved",
    },
    qrCodeUrl: { type: String }, // Cloudinary secure_url of the generated QR code
    qrCodePublicId: { type: String }, // Cloudinary public_id of the QR code
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Athlete", athleteSchema);
