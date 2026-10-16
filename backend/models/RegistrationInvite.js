const mongoose = require("mongoose");
const crypto = require("crypto");

// A shareable self-registration link a Head Coach sends to players. The
// player opens the link (no login needed), fills in their OWN details, and
// submits — which creates an Athlete record whose assignment starts "pending"
// (hidden from public search/verify) until an Admin approves it. Only on that
// approval is the player's individual login account created (see
// utils/playerAccount.js + athleteController's approve).
//
// The link itself is just this document's `token` — an unguessable random
// string, so the only way to reach the registration form is the exact link a
// coach shared. `createdBy` is the Head Coach (or Admin) who sent it, kept so
// the invite list can show who issued each one.
//
// USAGE LIMIT — one link can serve a whole squad:
//   maxUses: null   — unlimited. Anyone holding the link can register, as many
//                     people as they like (the "share it in the group chat"
//                     case). The link stays active until it's revoked/expires.
//   maxUses: 1      — the original one-player link; it dies after that one
//                     registration (existing links in the DB behave this way).
//   maxUses: N      — exactly N players may register through it, then it's full.
// `useCount` tracks how many already have, and `registrations` logs who they
// were so the coach's list shows everyone who signed up through a shared link.
// Subdocument schema for each athlete who registered through this link.
// Defined as a real mongoose.Schema (rather than an inline object literal) so
// Mongoose registers `registrations.athleteId` as a populated path with its
// `ref: "Athlete"` — required for .populate("registrations.athleteId", …) to
// work under Mongoose 8's strictPopulate.
const registrationSchema = new mongoose.Schema({
  athleteId: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete" },
  createdAt: { type: Date, default: Date.now },
});

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
    // How many players may register through this link.
    //   null      — unlimited: the shared link case (paste it in the team
    //               group chat, anyone who opens it can join).
    //   1         — one player only (the original behavior; every link that
    //               already exists in the DB defaults to this).
    //   N (> 1)   — exactly N players may use it, then it's full.
    // Validated in registrationController.createInvite rather than here so
    // null (unlimited) never trips a numeric validator.
    maxUses: { type: Number, default: 1 },
    // How many players have already registered through this link. The public
    // registration/claim routes refuse once useCount reaches a numeric
    // maxUses, and mark the link "used" at that point.
    useCount: { type: Number, default: 0 },
    // Every athlete who registered through this link, newest last — what the
    // coach's invite list shows for a shared link ("3 registered: …").
    registrations: { type: [registrationSchema], default: [] },
    // "active"  — usable, a player can still register through it.
    // "used"    — fully used: either the original one-player link, or a
    //             capped shared link that hit its maxUses. An unlimited link
    //             never reaches this on its own — it stays active until a
    //             coach revokes it or it expires.
    // "revoked" — cancelled by staff.
    status: { type: String, enum: ["active", "used", "revoked"], default: "active" },
    // The first athlete who registered through this link — kept for links
    // created before multi-use existed, and so the invite list still has a
    // single name to show for one-player links. For shared links, prefer
    // `registrations` (all of them).
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", default: null },
    // Optional expiry. Null = never expires. When set, a lookup past this
    // time treats the invite as expired (same UX as revoked/used).
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Remaining registrations this link can still accept. null = unlimited.
// Exposed so the invite list and the registration form can show "3 of 10
// used" / "unlimited" without duplicating the cap math.
registrationInviteSchema.methods.usesLeft = function () {
  if (this.maxUses === null || this.maxUses === undefined) return null;
  return Math.max(this.maxUses - (this.useCount || 0), 0);
};

// Whether this link can accept another registration right now: it must be
// active, not expired, and (when capped) not yet full. Every public route
// checks this instead of re-deriving the rules.
registrationInviteSchema.methods.isUsable = function () {
  if (this.status !== "active") return false;
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) return false;
  const left = this.usesLeft();
  return left === null || left > 0;
};

// A fresh 32-hex-char (128-bit) token — long enough that it can't be guessed
// or brute-forced, so the only way to reach a registration form is the exact
// link a coach shared.
registrationInviteSchema.statics.generateToken = function () {
  return crypto.randomBytes(16).toString("hex");
};

module.exports = mongoose.model("RegistrationInvite", registrationInviteSchema);
