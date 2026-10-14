const mongoose = require("mongoose");
const crypto = require("crypto");

// A shareable, single-use self-registration link a Head Coach sends to a
// player. The player opens the link (no login needed), fills in their OWN
// details, and submits — which creates an Athlete record whose assignment
// starts "pending" (hidden from public search/verify) until an Admin
// approves it. Only on that approval is the player's individual login
// account created (see utils/playerAccount.js + athleteController's approve).
//
// The link itself is just this document's `token` — an unguessable random
// string, so anyone with the URL can register exactly once, and nobody can
// enumerate valid links. `createdBy` is the Head Coach (or Admin) who sent
// it, kept so the invite list can show who issued each one.
const registrationInviteSchema = new mongoose.Schema(
  {
    // The secret in the shareable URL (/register/<token>). Unique + indexed
    // so a lookup by token is a single fast query and can never collide.
    token: { type: String, required: true, unique: true, index: true },
    // Which team this invite registers the player INTO. A Head Coach's own
    // team is forced server-side (never trusted from the request body); an
    // Admin may pick any team, same as adding an athlete directly. Must match
    // the `team` value used on Athlete assignments.
    team: { type: String, required: true },
    // The role the player is registered with — kept for future flexibility
    // (e.g. inviting an assistant), but the self-registration UI only ever
    // issues PLAYER invites today, matching the feature's purpose.
    role: {
      type: String,
      enum: ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"],
      default: "PLAYER",
    },
    // The Admin/Head Coach account that created this invite.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    // "active"  — usable, a player can still register through it.
    // "used"    — one player already self-registered (single-use by design,
    //             so a link shared in a group chat can't be reused to make a
    //             second account). Generate a fresh link for the next player.
    // "revoked" — cancelled by staff before anyone used it.
    status: { type: String, enum: ["active", "used", "revoked"], default: "active" },
    // Set the moment a player registers through this link — the Athlete they
    // created — so the coach's invite list can show who signed up.
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", default: null },
    // Optional expiry. Null = never expires. When set, a lookup past this
    // time treats the invite as expired (same UX as revoked/used).
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A fresh 32-hex-char (128-bit) token — long enough that it can't be guessed
// or brute-forced, so the only way to reach a registration form is the exact
// link a coach shared.
registrationInviteSchema.statics.generateToken = function () {
  return crypto.randomBytes(16).toString("hex");
};

module.exports = mongoose.model("RegistrationInvite", registrationInviteSchema);
