const mongoose = require("mongoose");

// One real person can belong to several teams, and can hold more than one
// role even within the same team (e.g. Head Coach for Team A, and also a
// Player + Assistant Coach for Team B) — each membership like that is one
// entry in `assignments` below, rather than a separate Athlete document.
// The person keeps ONE shared profile (name, DOB, photo, verifyId/QR, ID
// card) and the assignments array is what varies per team/role.
const assignmentSchema = new mongoose.Schema(
  {
    team: { type: String, required: true },
    role: {
      type: String,
      enum: ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"],
      default: "PLAYER",
    },
    // Publishing gate for this ONE assignment. A brand-new assignment added
    // by an Admin starts "approved" (immediately public); one added by a
    // Head Coach starts "pending" and is hidden from public search/verify
    // until an Admin approves it (PUT /:id/assignments/:assignmentId/approve).
    // This is scoped to the assignment, not the whole person, so approving
    // or un-approving one team/role never hides the person's other,
    // already-approved memberships.
    approvalStatus: {
      type: String,
      enum: ["pending", "approved"],
      default: "approved",
    },
    // A Head Coach can request to remove their own team's assignment, but
    // can't delete it outright — this just flags it as "awaiting Admin
    // confirmation" (PUT .../approve actually removes it, PUT .../reject
    // clears the flag and keeps it). An Admin's own delete is immediate and
    // never touches this flag.
    pendingRemoval: { type: Boolean, default: false },
    // Every separate fee/debt this person owes ON THIS TEAM — e.g. one row
    // for "Uniform fee: $10", another for "2026 registration: $15" — rather
    // than one combined number, so a new fee can be recorded without
    // erasing what was already there. The total owed is the sum of every
    // row's amount (0 rows, or all paid off/removed, means fully paid up).
    // Tracked per-assignment, not per-person, since someone on two teams can
    // be paid up on one and behind on the other. Only Admin/Head Coach/
    // Player ever see this (roster tables, squad-list picker, the Edit
    // page, the debt report, the player view) — it is never included in a
    // public API response (search/verify/share) or on any printed/exported
    // card.
    fees: {
      type: [
        new mongoose.Schema(
          {
            amount: { type: Number, required: true, min: 0 },
            note: { type: String, default: "" }, // e.g. "Uniform fee"
          },
          { timestamps: true }
        ),
      ],
      default: [],
    },
    // Shirt/kit number ON THIS TEAM — a person on two teams can wear a
    // different number on each, so this lives on the assignment, not the
    // shared profile. Purely a squad-list/lineup convenience: it never
    // gates approval (a Head Coach setting it doesn't send anything back to
    // "pending"), same reasoning as fees being pure bookkeeping.
    jerseyNumber: { type: Number, min: 0, max: 99, default: null },
  },
  { timestamps: true }
);

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
    address: { type: String },
    assignments: { type: [assignmentSchema], default: [] },
    isAvailable: {
      // whether the athlete is currently available to play (not injured/suspended/etc.)
      // — a whole-person status, shared across every team they're on.
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
    qrCodeUrl: { type: String }, // Cloudinary secure_url of the generated QR code
    qrCodePublicId: { type: String }, // Cloudinary public_id of the QR code
    // When this person's identity was last confirmed in person (checked
    // against their reference documents) and the "Renew" button pressed.
    // Purely advisory — there's no fixed expiry and it never blocks the
    // public verify page; it only drives a "needs renewal" badge once it's
    // more than a year old, so Admin/Head Coach know to re-check someone
    // (e.g. after they move up an age group).
    lastVerifiedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Athlete", athleteSchema);
