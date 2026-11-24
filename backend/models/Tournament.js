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
    // Snapshot of the athlete's assignment role at the moment they
    // registered (PLAYER, HEAD COACH, ASSISTAN COACH, MEDIC, TECHNICAL —
    // same values as Athlete.assignments.role). Anyone registered under a
    // non-PLAYER role is exempt from BOTH the tournament's maxParticipants
    // cap and its age-limit/overage rule (see buildRegistration/
    // checkAgeRule in the controller) — a coach or medic tagging along
    // shouldn't take a player's spot or be blocked by an age rule meant
    // for players.
    role: { type: String, default: "PLAYER" },
    fullName: { type: String, required: true }, // snapshot, so CSV export still works if the athlete record later changes
    khmerName: { type: String },
    verifyId: { type: String },
    photoUrl: { type: String, default: null }, // snapshot, same reason as fullName/khmerName/verifyId
    dateOfBirth: { type: Date, default: null }, // snapshot, same reason as fullName/khmerName/verifyId
    jerseyNumber: { type: Number, default: null },
    // null = the player registered themselves; set = which Admin/Head
    // Coach account registered them instead (no phone / couldn't self-serve).
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    // true = this person is older than the tournament's normal age cutoff
    // and used up one of the limited overage exception slots to register.
    // Always false when the tournament has no age limit set.
    isOverage: { type: Boolean, default: false },
    // Which of the tournament's overageRules this person's slot was taken
    // from (that rule's birthYear) — null when not overage. Older rows
    // registered before overageRules existed have this unset; the
    // controller works out their rule from dateOfBirth instead.
    // Over-age slots are counted PER TEAM (each team gets the same rules).
    overageYear: { type: Number, default: null },
    // true = this player lives outside the tournament's home area
    // (homeAreaCodes) and used one of their team's outsideSlotsPerTeam.
    isOutside: { type: Boolean, default: false },
    addressCode: { type: String, default: null }, // snapshot of Athlete.addressCode
    // Keys of the tournament's customCategories this player is tagged with
    // (set by Admin/Head Coach on the squad page, never by the player).
    categories: { type: [String], default: [] },
    // Set by Admin/Head Coach when this player pays the entry fee in person
    // (typically cash, on match day) — a simple note in the list, not a
    // payment record of its own. `feePaidAmount` is the actual cash amount
    // entered (can be less than the tournament's entryFee for a partial
    // payment); `feePaid` is kept true only once that amount covers the
    // full entry fee. Once `convertedToDebt` is true below, none of this is
    // editable here any more; any remaining/late payment is collected the
    // normal way, via the Debt report's cash-payment / ABA flow.
    feePaidAmount: { type: Number, default: 0, min: 0 },
    feePaid: { type: Boolean, default: false },
    feePaidAt: { type: Date, default: null },
    feePaidBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    // true once this registration's unpaid entry fee has been rolled into
    // the athlete's regular owed-fee list (see Tournament.debtSettledAt) —
    // from that point on it's tracked as ordinary debt, not here.
    convertedToDebt: { type: Boolean, default: false },
    // A Player withdrawing THEMSELF (their own individual login) can't
    // remove their registration outright — this just flags it as "awaiting
    // Admin/Head Coach confirmation," same idea as Athlete.assignments'
    // pendingRemoval. The registration stays fully in place (still counts
    // toward the roster/squad list/cap) until staff either confirms it
    // (DELETE .../registrations/:id — actually removes it) or declines it
    // (PATCH .../registrations/:id/keep — clears this flag). An Admin/Head
    // Coach removing someone by hand never goes through this flag; it's
    // always immediate, exactly like before.
    pendingRemoval: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    // What it costs to enter — shown to players before they register.
    entryFee: { type: Number, default: 0, min: 0 },
    // Currency of entryFee (and of each registration's feePaidAmount):
    // "KHR" riel or "USD" dollars. Older tournaments don't have it saved —
    // feeCurrency() below decides for them (100 or more = riel).
    entryFeeCurrency: { type: String, enum: ["KHR", "USD"] },
    // One or more dates this tournament is played on.
    matchDates: { type: [Date], default: [] },
    // null/"" = open to every team. Set = only that team's players may
    // register. A Head Coach can only ever create/manage a tournament
    // scoped to their own team; only an Admin can leave this open.
    team: { type: String, default: "" },
    // Only used when `team` is blank (Admin-made tournaments): which teams
    // may register. Empty = every team. A Head Coach's own tournament
    // always uses `team` instead.
    allowedTeams: { type: [String], default: [] },
    // Per-team squad size — PLAYER registrations only, each team counted
    // on its own. null/0 = no limit. The minimum is shown as a warning on
    // the squad page; it doesn't block anything.
    maxPlayersPerTeam: { type: Number, default: null },
    minPlayersPerTeam: { type: Number, default: null },
    // "Outside district" rule. homeAreaCodes = the home area as gazetteer
    // codes (province "17" or district "1701" — see utils/gazetteer.js);
    // empty = no rule. A player whose Athlete.addressCode isn't inside any
    // of them is an outsider; each team may register up to
    // outsideSlotsPerTeam of them (0 = none allowed).
    homeAreaCodes: { type: [String], default: [] },
    outsideSlotsPerTeam: { type: Number, default: 0 },
    // Admin-defined limited categories, e.g. { label: "Foreign player",
    // maxPerTeam: 1 }. Staff tag registrations with them; the limit is
    // enforced per team when tagging.
    customCategories: {
      type: [
        {
          _id: false,
          key: { type: String, required: true },
          label: { type: String, required: true },
          maxPerTeam: { type: Number, default: 0 }, // 0 = no limit, just a tag
        },
      ],
      default: [],
    },
    // Free-text rules shown to players (not enforced by the system).
    rulesText: { type: String, default: "" },
    // Age rule — all optional; null/0 = no restriction of that kind.
    // Example: ageLimitYear 2010, overageSlots 4, overageLimitYear 2008
    // means "born 2010 or later to register normally; up to 4 players born
    // 2008 or 2009 may register anyway (an 'overage' exception); nobody
    // born before 2008 can register at all."
    ageLimitYear: { type: Number, default: null },
    // Several over-age exceptions, each "up to `slots` players born in
    // `birthYear` or later" (still older than ageLimitYear). Example:
    // ageLimitYear 2010 + [{2008, 3}, {2006, 1}] means born 2010+ register
    // normally, up to 3 players born 2008–2009 and 1 more born 2006–2007.
    // A player always takes the youngest rule they fit that still has
    // space, falling back to an older rule when that one is full. Nobody
    // older than the oldest rule's year can register.
    overageRules: {
      type: [
        {
          _id: false,
          birthYear: { type: Number, required: true },
          slots: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    // LEGACY single-exception fields (before overageRules) — still read
    // for older tournaments while overageRules is empty; cleared as soon as
    // the tournament's age rule is saved again.
    overageSlots: { type: Number, default: 0 },
    overageLimitYear: { type: Number, default: null },
    // Total registration cap across the whole tournament. null/0 = no cap.
    maxParticipants: { type: Number, default: null },
    // Set by Admin/Head Coach to stop players from self-registering or
    // self-cancelling (e.g. once the roster is final) — staff can still
    // register/remove someone by hand at any time, and can flip this back
    // open again whenever they want.
    registrationClosed: { type: Boolean, default: false },
    registrations: { type: [registrationSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    // Set once anyone still unpaid at tournament-end has had their entry fee
    // converted into regular debt (see settleUnpaidToDebt in the
    // controller) — guards that conversion from ever running twice.
    debtSettledAt: { type: Date, default: null },
    // One auto-managed Lineup ("Squad list", the same thing the My Team >
    // Squad list tab manages) per team registering in this tournament — kept
    // in sync as people register/unregister, so a coach can go straight from
    // tournament sign-ups into Formation/Starting XI without re-picking the
    // squad by hand. Keyed by team since an open tournament can span several.
    teamLineups: {
      type: [
        {
          team: { type: String, required: true },
          lineup: { type: mongoose.Schema.Types.ObjectId, ref: "Lineup", required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// The entry fee's currency, for tournaments saved before it was stored:
// the form used to say ៛, so a fee of 100 or more is riel; a small number
// (like 2.5) was typed as dollars.
function feeCurrency(t) {
  if (t && (t.entryFeeCurrency === "KHR" || t.entryFeeCurrency === "USD")) return t.entryFeeCurrency;
  return Number(t?.entryFee || 0) >= 100 ? "KHR" : "USD";
}
// Always send the currency to the website, saved or worked out.
const withCurrency = (doc, ret) => {
  ret.entryFeeCurrency = feeCurrency(ret);
  return ret;
};
tournamentSchema.set("toJSON", { transform: withCurrency });
tournamentSchema.set("toObject", { transform: withCurrency });

const Tournament = mongoose.model("Tournament", tournamentSchema);
Tournament.feeCurrency = feeCurrency;
module.exports = Tournament;
