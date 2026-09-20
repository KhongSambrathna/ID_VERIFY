const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // hashed
    role: {
      // ADMIN can manage every athlete record and create/manage user logins.
      // HEAD_COACH can only pull athletes already in their own `team` into
      // lineups — they cannot add/edit/delete athlete records.
      // PLAYER is a single shared, read-only login for everyone on one team
      // — they can see (never edit) every athlete on their own team,
      // including fee/debt info, same as a Head Coach sees, just with no
      // write access at all.
      // REFEREE is an independent, team-less account — not tied to any
      // roster. View-only: it can see the tournament/match schedule across
      // every team, and nothing else (no fee/debt info, no editing).
      type: String,
      enum: ["ADMIN", "HEAD_COACH", "PLAYER", "REFEREE"],
      default: "ADMIN",
    },
    team: {
      // required for HEAD_COACH and PLAYER accounts — which team's roster
      // they can see. Should match the `team` value used on Athlete records.
      // For an individual player account (athleteId set below) this is just
      // that athlete's FIRST team assignment — only used for the shared
      // team-roster view; tournament registration looks at the athlete's
      // full assignments list instead, not this single field.
      // Left unset for REFEREE — a referee doesn't belong to any team.
      type: String,
    },
    // Set only on an individual PLAYER account (one login per athlete, used
    // for tournament self-registration) — links this login back to the one
    // Athlete document it belongs to. A shared/legacy PLAYER login (one
    // password for a whole team, created the old way) leaves this unset.
    athleteId: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", default: null },
    // True right after an account is created with the default password (or
    // after an Admin/Head Coach/Telegram self-service reset) — the frontend
    // forces a password-change screen before anything else is usable until
    // this flips back to false.
    mustChangePassword: { type: Boolean, default: false },
    // Optional Telegram notifications. For ADMIN/HEAD_COACH: pending
    // approvals, approve/reject, new fees. For an individual PLAYER
    // account: only used for the self-service "forgot password" flow (a
    // temporary password is sent here). Empty/unset = skipped, nothing
    // breaks. Get this by messaging the club's bot once, then looking the
    // numeric chat id up (e.g. via @userinfobot).
    telegramChatId: { type: String, default: "" },
  },
  { timestamps: true }
);

adminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("Admin", adminSchema);
