const mongoose = require("mongoose");

// One registration = one athlete signed up to play in this tournament
// (self-registered from their own individual Player login, or entered by
// an Admin/Head Coach on their behalf — e.g. a player with no phone).
// `team` is which of the athlete's own team assignments they're playing
// under here — needed because one person can belong to more than one team,
// and it's what the debt check (in the controller) is checked against.
const registrationSchema = new mongoose.Schema(
  {
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", required: true },
    team: { type: String, required: true },
    fullName: { type: String, required: true }, // snapshot, so CSV export still works if the athlete record later changes
    khmerName: { type: String },
    verifyId: { type: String },
    jerseyNumber: { type: Number, default: null },
    // null = the player registered themselves; set = which Admin/Head
    // Coach account registered them instead (no phone / couldn't self-serve).
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    // true = this person is older than the tournament's normal age cutoff
    // and used up one of the limited overage exception slots to register.
    // Always false when the tournament has no age limit set.
    isOverage: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    // What it costs to enter — shown to players before they register.
    entryFee: { type: Number, default: 0, min: 0 },
    // One or more dates this tournament is played on.
    matchDates: { type: [Date], default: [] },
    // null/"" = open to every team. Set = only that team's players may
    // register. A Head Coach can only ever create/manage a tournament
    // scoped to their own team; only an Admin can leave this open.
    team: { type: String, default: "" },
    // Age rule — all optional; null/0 = no restriction of that kind.
    // Example: ageLimitYear 2010, overageSlots 4, overageLimitYear 2008
    // means "born 2010 or later to register normally; up to 4 players born
    // 2008 or 2009 may register anyway (an 'overage' exception); nobody
    // born before 2008 can register at all."
    ageLimitYear: { type: Number, default: null },
    overageSlots: { type: Number, default: 0 },
    overageLimitYear: { type: Number, default: null },
    // Total registration cap across the whole tournament. null/0 = no cap.
    maxParticipants: { type: Number, default: null },
    registrations: { type: [registrationSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tournament", tournamentSchema);
