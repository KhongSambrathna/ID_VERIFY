const Athlete = require("../models/Athlete");
const Payment = require("../models/Payment");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

// Same access rule as fees (see athleteController.findAssignmentForFee):
// Admin can touch any team, Head Coach/Player only their own team's
// assignment.
async function findAssignmentForPayment(req, athleteId, assignmentId) {
  const athlete = await Athlete.findById(athleteId);
  if (!athlete) return { error: [404, "Athlete not found"] };
  const assignment = athlete.assignments.id(assignmentId);
  if (!assignment) return { error: [404, "Assignment not found"] };
  if (req.adminRole !== "ADMIN" && assignment.team !== req.adminTeam) {
    return { error: [403, "Access denied"] };
  }
  return { athlete, assignment };
}

function feeOwedOf(assignment) {
  return (assignment.fees || []).reduce((sum, f) => sum + (f.amount || 0), 0);
}

// Reduces/removes fee rows oldest-first until `amount` has been applied —
// the same "amount owed" bookkeeping an admin could already do by hand via
// updateFee/removeFee, just automatic. Caller must have already confirmed
// amount <= current feeOwed. Saves the athlete document and returns the
// resulting feeOwed.
async function applyPaymentToFees(athlete, assignment, amount) {
  let remaining = amount;
  const sorted = [...assignment.fees].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  for (const fee of sorted) {
    if (remaining <= 0) break;
    if (fee.amount <= remaining) {
      remaining = Math.round((remaining - fee.amount) * 100) / 100;
      assignment.fees = assignment.fees.filter((f) => String(f._id) !== String(fee._id));
    } else {
      fee.amount = Math.round((fee.amount - remaining) * 100) / 100;
      remaining = 0;
    }
  }
  await athlete.save();
  return feeOwedOf(assignment);
}


// POST /api/payments/cash  { athleteId, assignmentId, amount, note, method? }
// Admin/Head Coach manually records a payment received outside the
// automated Bakong QR flow — same role restriction as adding a fee.
// `method` is "CASH" (default, money received in person) or "ABA_QR" (paid
// by scanning the team's own ABA Merchant KHQR — see Team.abaKhqrImageUrl
// — and reported back to be recorded here).
exports.recordCashPayment = async (req, res) => {
  try {
    const { athleteId, assignmentId, amount: rawAmount, note, method: rawMethod } = req.body;
    const { athlete, assignment, error } = await findAssignmentForPayment(req, athleteId, assignmentId);
    if (error) return res.status(error[0]).json({ message: error[1] });

    const method = rawMethod === "ABA_QR" ? "ABA_QR" : "CASH";
    const amount = Math.round(Number(rawAmount) * 100) / 100;
    const owed = feeOwedOf(assignment);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }
    if (amount > owed) {
      return res.status(400).json({ message: "Amount is more than what's currently owed" });
    }

    const newFeeOwed = await applyPaymentToFees(athlete, assignment, amount);

    await Payment.create({
      athlete: athlete._id,
      assignmentId: assignment._id,
      team: assignment.team,
      amount,
      method,
      status: "COMPLETED",
      recordedBy: req.adminId,
      note: String(note || "").slice(0, 200),
    });

    const methodLabel = method === "ABA_QR" ? "via ABA (KHQR)" : "in cash";
    const text = `💵 ${athlete.fullName} (${assignment.team}) paid $${amount} ${methodLabel}`;
    notifyAdmins(text);
    notifyTeamCoaches(assignment.team, text);

    res.status(201).json({ feeOwed: newFeeOwed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/payments/:athleteId/:assignmentId — payment history for one assignment.
exports.listPayments = async (req, res) => {
  try {
    const { athleteId, assignmentId } = req.params;
    const { error } = await findAssignmentForPayment(req, athleteId, assignmentId);
    if (error) return res.status(error[0]).json({ message: error[1] });

    const payments = await Payment.find({ athlete: athleteId, assignmentId }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
