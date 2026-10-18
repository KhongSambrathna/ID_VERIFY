const Athlete = require("../models/Athlete");
const Payment = require("../models/Payment");
const { createPayment, getQrImage, checkTransaction } = require("../utils/bakong");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

// Same access rule as fees: Admin any team, Head Coach/Player only their own team's assignment.
async function findAssignmentForBakong(req, athleteId, assignmentId) {
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

// POST /api/bakong/payment/create  { athleteId, assignmentId, amount, currency?, orderInfo? }
// Creates a Bakong payment and returns the QR data (+ md5) the frontend needs
// to display a scannable KHQR. Saves a Payment row (status PENDING) keyed by md5.
exports.createBakongPayment = async (req, res) => {
  try {
    const { athleteId, assignmentId, amount: rawAmount, currency, orderInfo } = req.body;
    const { athlete, assignment, error } = await findAssignmentForBakong(req, athleteId, assignmentId);
    if (error) return res.status(error[0]).json({ message: error[1] });

    const amount = Math.round(Number(rawAmount) * 100) / 100;
    const owed = feeOwedOf(assignment);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }
    if (amount > owed) {
      return res.status(400).json({ message: "Amount is more than what's currently owed" });
    }

    let bakongResult;
    try {
      bakongResult = await createPayment({ amount, currency, orderInfo });
    } catch (err) {
      return res.status(502).json({ message: err.message || "Bakong payment creation failed" });
    }

    const md5 = bakongResult.md5;
    if (!md5) {
      return res.status(502).json({ message: "Bakong did not return a payment reference (md5)" });
    }

    await Payment.create({
      athlete: athlete._id,
      assignmentId: assignment._id,
      team: assignment.team,
      amount,
      method: "BAKONG",
      status: "PENDING",
      reference: md5,
      recordedBy: req.adminId,
      note: String(orderInfo || "").slice(0, 200),
    });

    return res.json({
      status: "PENDING",
      amount,
      currency: bakongResult.currency || currency || "USD",
      qr: bakongResult.qr,
      md5,
      feeOwed: owed,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/bakong/qr-image?md5=...  (or POST { md5 })
// Proxies Bakong's QR-image endpoint so the frontend never handles the Bearer token.
// Returns the PNG image with the correct content type.
exports.getBakongQrImage = async (req, res) => {
  try {
    const md5 = req.query.md5 || (req.body && req.body.md5);
    if (!md5) return res.status(400).json({ message: "md5 is required" });

    const payment = await Payment.findOne({ reference: md5, method: "BAKONG" });
    if (!payment) return res.status(404).json({ message: "Bakong payment not found" });

    let qr;
    try {
      const fresh = await createPayment({
        amount: payment.amount,
        currency: payment.currency || "USD",
        orderInfo: payment.note || "Athlete fee payment",
      });
      qr = fresh.qr;
    } catch (err) {
      return res.status(502).json({ message: err.message || "Failed to regenerate Bakong QR" });
    }

    let buffer;
    try {
      buffer = await getQrImage({ qr, md5 });
    } catch (err) {
      return res.status(502).json({ message: err.message || "Failed to fetch Bakong QR image" });
    }

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    return res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// POST /api/bakong/check-transaction  { md5 }
// Server-to-server verification with Bakong. If paid (responseCode 0), applies the
// payment to the athlete's outstanding fees and marks the Payment row COMPLETED.
exports.checkBakongTransaction = async (req, res) => {
  try {
    const { md5 } = req.body;
    if (!md5) return res.status(400).json({ message: "md5 is required" });

    const payment = await Payment.findOne({ reference: md5, method: "BAKONG" });
    if (!payment) return res.status(404).json({ message: "Bakong payment not found" });

    let data;
    try {
      data = await checkTransaction(md5);
    } catch (err) {
      return res.status(502).json({ message: err.message || "Bakong transaction check failed" });
    }

    if (data.responseCode !== 0) {
      // 1 = not yet paid / invalid md5 — leave the row PENDING for a retry.
      return res.json({ status: "PENDING", responseCode: data.responseCode, message: data.responseMessage });
    }

    // Paid — credit it once (idempotent: skip if already COMPLETED).
    if (payment.status === "COMPLETED") {
      const athlete = await Athlete.findById(payment.athlete);
      const assignment = athlete.assignments.id(payment.assignmentId);
      return res.json({ status: "COMPLETED", feeOwed: feeOwedOf(assignment) });
    }

    const athlete = await Athlete.findById(payment.athlete);
    const assignment = athlete.assignments.id(payment.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    if (req.adminRole !== "ADMIN" && assignment.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    const paidAmount = data.data?.amount ?? payment.amount;
    const newFeeOwed = await applyPaymentToFees(athlete, assignment, paidAmount);

    payment.status = "COMPLETED";
    payment.amount = paidAmount;
    payment.bakongResponse = data;
    await payment.save();

    const text = `💳 ${athlete.fullName} (${assignment.team}) paid $${paidAmount} via Bakong`;
    notifyAdmins(text);
    notifyTeamCoaches(assignment.team, text);

    return res.json({ status: "COMPLETED", feeOwed: newFeeOwed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reduces/removes fee rows oldest-first until `amount` has been applied.
// Caller must have already confirmed amount <= current feeOwed.
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

// POST /api/bakong/record  { athleteId, assignmentId, amount, md5?, note? }
// Manual record of a Bakong payment received outside the auto-check flow
// (Admin / Head Coach only). method is stored as "BAKONG".
exports.recordBakongPayment = async (req, res) => {
  try {
    const { athleteId, assignmentId, amount: rawAmount, md5, note } = req.body;
    const { athlete, assignment, error } = await findAssignmentForBakong(req, athleteId, assignmentId);
    if (error) return res.status(error[0]).json({ message: error[1] });

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
      method: "BAKONG",
      status: "COMPLETED",
      reference: md5 || null,
      recordedBy: req.adminId,
      note: String(note || "").slice(0, 200),
    });

    const text = `💵 ${athlete.fullName} (${assignment.team}) paid $${amount} via Bakong`;
    notifyAdmins(text);
    notifyTeamCoaches(assignment.team, text);

    res.status(201).json({ feeOwed: newFeeOwed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


