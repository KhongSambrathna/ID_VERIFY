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
      type: String,
      enum: ["ADMIN", "HEAD_COACH", "PLAYER"],
      default: "ADMIN",
    },
    team: {
      // required for HEAD_COACH and PLAYER accounts — which team's roster
      // they can see. Should match the `team` value used on Athlete records.
      type: String,
    },
    // Optional Telegram notifications (pending approvals, approve/reject,
    // new fees). Empty/unset = notifications are just skipped for this
    // account — nothing breaks. Get this by messaging the club's bot once,
    // then looking the numeric chat id up (e.g. via @userinfobot).
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
