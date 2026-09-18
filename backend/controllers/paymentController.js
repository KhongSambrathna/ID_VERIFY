const Athlete = require("../models/Athlete");
const Payment = require("../models/Payment");
const { generateTranId, buildPurchaseFields, checkTransaction } = require("../utils/abaPayway");
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

// POST /api/payments/aba/create  { athleteId, assignmentId, amount }
// Starts an ABA PayWay checkout for a partial or full payment against one
// assignment's outstanding fees. Returns the form fields (incl. signed
// hash) the frontend must POST as a real <form> to ABA's Purchase endpoint
// — this backend never touches card/QR details itself.
exports.createAbaPayment = async (req, res) => {
  try {
    const { athleteId, assignmentId, amount: rawAmount } = req.body;
    const { athlete, assignment, error } = await findAssignmentForPayment(req, athleteId, assignmentId);
    if (error) return res.status(error[0]).json({ message: error[1] });

    const amount = Math.round(Number(rawAmount) * 100) / 100;
    const owed = feeOwedOf(assignment);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }
    if (amount > owed) {
      return res.status(400).json({ message: "Amount is more than what's currently owed" });
    }

    const baseUrl = process.env.ABA_PAYWAY_BASE_URL;
    if (!baseUrl || !process.env.ABA_PAYWAY_MERCHANT_ID || !process.env.ABA_PAYWAY_API_KEY) {
      return res.status(500).json({ message: "ABA PayWay is not configured yet — set the ABA_PAYWAY_* environment variables" });
    }
    const frontendBase = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

    const tranId = generateTranId();
    const returnUrl = `${frontendBase}/payment/return?tranId=${encodeURIComponent(tranId)}`;
    const fields = buildPurchaseFields({ tranId, amount, returnUrl });

    await Payment.create({
      athlete: athlete._id,
      assignmentId: assignment._id,
      team: assignment.team,
      amount,
      method: "ABA",
      status: "PENDING",
      tranId,
    });

    res.status(201).json({
      actionUrl: `${baseUrl.replace(/\/$/, "")}/api/payment-gateway/v1/payments/purchase`,
      fields,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/payments/aba/confirm  { tranId }
// Called by the frontend's /payment/return page once ABA redirects the
// payer back. Never trusts that redirect by itself — always re-checks the
// real status server-to-server with ABA before applying anything.
exports.confirmAbaPayment = async (req, res) => {
  try {
    const { tranId } = req.body;
    if (!tranId) return res.status(400).json({ message: "tranId is required" });

    const payment = await Payment.findOne({ tranId });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Idempotent — a second confirm call (e.g. the return page reloading)
    // just reports what was already decided, never re-applies it.
    if (payment.status !== "PENDING") {
      return res.json({ status: payment.status });
    }

    const result = await checkTransaction(tranId);
    if (result?.status?.code !== "00") {
      return res.json({ status: "PENDING", message: result?.status?.message || "Not confirmed yet" });
    }

    const data = result.data || {};

    if (data.payment_status_code === 0) {
      // APPROVED. Trust our own recorded amount (fixed server-side when the
      // transaction was created) — but refuse to apply anything if ABA's
      // own confirmed amount disagrees, surfacing the mismatch for manual
      // review instead of silently trusting either side.
      const confirmedAmount = Number(data.payment_amount ?? data.total_amount);
      if (Number.isFinite(confirmedAmount) && Math.abs(confirmedAmount - payment.amount) > 0.01) {
        payment.status = "FAILED";
        payment.note = `Amount mismatch: requested $${payment.amount}, ABA confirmed $${confirmedAmount}`;
        await payment.save();
        return res.status(409).json({ message: "Payment amount mismatch — please contact support" });
      }

      const athlete = await Athlete.findById(payment.athlete);
      const assignment = athlete?.assignments?.id(payment.assignmentId);
      if (!athlete || !assignment) {
        payment.status = "FAILED";
        payment.note = "Athlete/assignment no longer exists";
        await payment.save();
        return res.status(404).json({ message: "Athlete record no longer exists" });
      }

      // Owed may have dropped since this payment was created (another
      // payment landed first) — never apply more than what's actually still
      // owed right now.
      const owed = feeOwedOf(assignment);
      const applyAmount = Math.min(payment.amount, owed);
      const newFeeOwed = await applyPaymentToFees(athlete, assignment, applyAmount);

      payment.status = "COMPLETED";
      payment.abaStatusCode = data.payment_status_code;
      payment.abaPaymentOption = data.payment_type || "";
      await payment.save();

      const text = `💳 ${athlete.fullName} (${assignment.team}) paid $${payment.amount} via ABA PayWay`;
      notifyAdmins(text);
      notifyTeamCoaches(assignment.team, text);

      return res.json({ status: "COMPLETED", feeOwed: newFeeOwed });
    }

    if (data.payment_status_code === 3) {
      payment.status = "FAILED";
    } else if (data.payment_status_code === 7) {
      payment.status = "CANCELLED";
    } else {
      // Still 2 (PENDING) or some other in-flight state — leave the Payment
      // row alone so a later confirm call can still resolve it.
      return res.json({ status: "PENDING" });
    }
    await payment.save();
    res.json({ status: payment.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/payments/cash  { athleteId, assignmentId, amount, note, method? }
// Admin/Head Coach manually records a payment received outside the
// automated ABA PayWay flow — same role restriction as adding a fee.
// `method` is "CASH" (default, money received in person) or "ABA_QR" (paid
// by scanning the team's own ABA Merchant KHQR — see Team.abaKhqrImageUrl
// — and reported to the Admin/Head Coach, who confirms it happened here).
// Either way this is a manual, trust-the-staff record, unlike method "ABA"
// which is only ever written by confirmAbaPayment after a real
// server-to-server check with ABA.
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
