const mongoose = require("mongoose");

// One row per payment attempt/record against a specific assignment's fees.
// This is a ledger/audit trail ONLY — it does not drive feeOwed math.
// feeOwed stays computed purely from assignment.fees[] exactly as it always
// has (see flattenAssignments.js); when a payment is confirmed (a Bakong
// transaction comes back COMPLETED, or an admin records a cash/KHQR payment),
// the matching fee rows are reduced/removed in that same instant
// — see bakongController.applyPaymentToFees / paymentController.applyPaymentToFees
// — so the two always agree and nothing elsewhere in the app needs to change.
const paymentSchema = new mongoose.Schema(
  {
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    team: { type: String, required: true }, // denormalized for easy filtering/reporting
    amount: { type: Number, required: true, min: 0.01 },
    // BAKONG: Bakong Open API (National Bank of Cambodia) KHQR / interbank
    // payment — created via POST /api/bakong/payment/create and confirmed
    // via POST /api/bakong/check-transaction. CASH: money received in
    // person. ABA_QR: paid by scanning the team's static ABA Merchant KHQR
    // image (see Team.abaKhqrImageUrl) and then manually confirmed by an
    // Admin/Head Coach — the fallback for a team that only has the ABA
    // Merchant app, not full API access.
    method: { type: String, enum: ["BAKONG", "CASH", "ABA_QR"], required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "PENDING",
    },
    // Bakong payment reference (md5) — used to look up a Bakong payment by its
    // md5 when checking transaction status or displaying the QR image.
    reference: { type: String, index: true },
    // ABA PayWay fields — only ever set for legacy method: "ABA" records.
    tranId: { type: String, index: true },
    abaStatusCode: { type: Number },
    abaPaymentOption: { type: String }, // e.g. "abapay_khqr", "cards"
    // Cash/ABA_QR fields — only ever set for those two manually-recorded methods.
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
