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
      type: String,
      enum: ["ADMIN", "HEAD_COACH"],
      default: "ADMIN",
    },
    team: {
      // required for HEAD_COACH accounts — which team's roster they can see.
      // Should match the `team` value used on Athlete records.
      type: String,
    },
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
