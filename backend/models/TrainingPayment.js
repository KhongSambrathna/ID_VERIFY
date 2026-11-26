const mongoose = require("mongoose");

// One training-fee payment (riel) a student made to their team — by the
// day, the week or the month. The student's balance is all their payments
// minus the training sessions they attended (see trainingFeeController.js).
const trainingPaymentSchema = new mongoose.Schema(
  {
    team: { type: String, required: true },
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", required: true },
    fullName: { type: String, default: "" }, // snapshot
    amount: { type: Number, required: true, min: 1 }, // riel, whole number
    plan: { type: String, enum: ["day", "week", "month"], default: "month" },
    date: { type: Date, default: Date.now },
    note: { type: String, default: "", trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

trainingPaymentSchema.index({ team: 1, athlete: 1, date: -1 });

module.exports = mongoose.model("TrainingPayment", trainingPaymentSchema);
