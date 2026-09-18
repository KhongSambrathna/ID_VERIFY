const mongoose = require("mongoose");

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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", teamSchema);
