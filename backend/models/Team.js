const mongoose = require("mongoose");
const { JERSEY_SIZES } = require("../utils/jerseySizes");

// One "jersey order" = one player's request to have a shirt printed with a
// given name/number for this team — self-registered from an individual
// Player login, or entered by an Admin/Head Coach on their behalf (no
// phone / couldn't self-serve), same idea as Tournament registrations.
// `fullName`/`photoUrl` are snapshots (same reasoning as
// Tournament.registrationSchema's) so this keeps making sense even if the
// athlete's profile is edited later.
const jerseyOrderSchema = new mongoose.Schema(
  {
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", required: true },
    fullName: { type: String, required: true },
    photoUrl: { type: String, default: null },
    // What actually gets printed on the shirt — doesn't have to match
    // fullName (a nickname/short name is common).
    jerseyName: { type: String, required: true, trim: true },
    jerseyNumber: { type: Number, required: true, min: 0, max: 99 },
    // Kids/Adult size — see utils/jerseySizes.js for the fixed option list.
    jerseySize: { type: String, required: true, enum: JERSEY_SIZES },
    // Free-text note from whoever placed the order — e.g. a special request
    // or a detail that doesn't fit any other field. Optional, never gates
    // anything.
    note: { type: String, default: "", trim: true },
    // null = the player ordered it themselves; set = which Admin/Head Coach
    // account registered it on their behalf.
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    // Cash amount collected so far — a simple note in the list, same as
    // Tournament registrations' entry-fee tracking. There's no single fixed
    // jersey price configured anywhere in this app (unlike a tournament's
    // entryFee), so `feePaid` is a plain yes/no an Admin/Head Coach sets
    // themselves once it's been fully settled, rather than a computed
    // amount-vs-price comparison.
    feePaidAmount: { type: Number, default: 0, min: 0 },
    feePaid: { type: Boolean, default: false },
    feePaidAt: { type: Date, default: null },
    feePaidBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    // A Player can freely change their own jersey name/number/size/note,
    // but can't remove the order outright — this just flags it as "awaiting Admin/
    // Head Coach confirmation," same pattern as Athlete.assignments'
    // pendingRemoval and Tournament.registrationSchema's pendingRemoval.
    // The order stays fully in place until staff either confirms the
    // removal or declines it (keeping the order as-is). An Admin/Head
    // Coach removing an order by hand never goes through this flag.
    pendingRemoval: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const teamSchema = new mongoose.Schema(
  {
    // canonical team name — chosen from a dropdown everywhere in the app so
    // athlete records and Head Coach accounts always match exactly, instead
    // of relying on someone typing the same name the same way every time.
    name: { type: String, required: true, unique: true, trim: true },

    // Club subscription — Basic/Pro/Pro Max/Unlimited, priced per plan and
    // billing cycle (see utils/subscriptionPlans.js) — paid outside the app
    // (bank transfer, Wing/ABA, Telegram, cash, etc.) and recorded here by
    // an Admin; there is no in-app payment gateway. `subscriptionPlan` is
    // what caps how many PLAYER-role assignments the team can hold (see
    // countTeamPlayers) — it's kept even after the subscription expires, so
    // a lapsed team's last-held plan is still what it renews back into.
    // `subscriptionExpiresAt` is the single source of truth for whether the
    // subscription is currently ACTIVE (compare against "now" rather than
    // storing a separate boolean, so it can never drift out of sync); null
    // means the team has never been subscribed. `subscriptionHistory` is an
    // append-only paper trail of every payment an Admin has recorded,
    // oldest first.
    //
    // `plan`/`billingCycle` on each history entry are deliberately NOT
    // `required` even though the controller always fills them in for every
    // new entry: teams that subscribed before the tiered-plan system existed
    // have older history entries with no plan/billingCycle at all, and
    // Mongoose re-validates the WHOLE array on every save — a `required`
    // here would reject any save (a new payment, a revoke) for a team that
    // simply has one of those old entries sitting in its history. Keeping
    // the enum (so a value, once present, must still be valid) without
    // `required` lets old rows stay as loosely-typed history while new rows
    // are always fully populated.
    subscriptionPlan: {
      type: String,
      enum: ["BASIC", "PRO", "PRO_MAX", "UNLIMITED"],
      default: null,
    },
    subscriptionExpiresAt: { type: Date, default: null },

    // A static KHQR image (screenshot/export from the team's own ABA
    // Merchant mobile app) that this team's players scan to pay their fees
    // — for a team whose only ABA product is the Merchant app (no PayWay
    // API access), this is the whole payment flow: no amount is embedded in
    // a static QR, so whoever pays has to type the amount themselves, and
    // an Admin/Head Coach then manually records it as received (see
    // paymentController.recordCashPayment, method "ABA_QR"). Uploaded/
    // removed by that team's own Head Coach only (see
    // teamController.uploadMyKhqr/removeMyKhqr) — this is deliberately
    // per-team, not club-wide, since each team is its own paying tenant
    // with (potentially) its own separate ABA Merchant account.
    abaKhqrImageUrl: { type: String, default: null },
    abaKhqrImagePublicId: { type: String, default: null },

    // The team's own crest/badge — purely cosmetic, shown next to the QR
    // code on that team's players' ID cards (see IDCard.jsx). No sensitive
    // data involved (unlike the KHQR payment image above), so it's served
    // from a public, unauthenticated route (teamController.getTeamLogo).
    // Uploaded/removed either by that team's own Head Coach (uploadMyLogo/
    // removeMyLogo) or by an Admin for any team (uploadTeamLogo/
    // removeTeamLogo) — whichever is more convenient for a given club.
    logoUrl: { type: String, default: null },
    logoPublicId: { type: String, default: null },

    subscriptionHistory: {
      type: [
        {
          plan: { type: String, enum: ["BASIC", "PRO", "PRO_MAX", "UNLIMITED"] },
          billingCycle: { type: String, enum: ["MONTHLY", "HALF_YEAR", "YEARLY"] },
          amount: { type: Number, required: true },
          months: { type: Number, required: true },
          paidAt: { type: Date, default: Date.now },
          expiresAt: { type: Date, required: true },
          note: { type: String, default: "" },
          recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
        },
      ],
      default: [],
    },

    // This team's jersey/kit print orders — see jerseyOrderSchema above.
    // One combined list (not split per season/event) since a shirt order is
    // an ongoing thing, not scoped to any one tournament.
    jerseyOrders: { type: [jerseyOrderSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", teamSchema);
