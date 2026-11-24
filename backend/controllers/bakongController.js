const Athlete = require("../models/Athlete");
const Payment = require("../models/Payment");
const Tournament = require("../models/Tournament");
const pay = require("../utils/khqrPay");
const fees = require("../utils/feePayments");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

// Bakong KHQR for student debts and tournament entry fees. The QR is made
// locally (utils/khqrPay.js, official "bakong-khqr" package) and checked with
// the Bakong Open API — see utils/feePayments.js for the whole flow.

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

// Who may see / check a payment: Admin any; others only their own team's
// (and a Player only their own).
function canSee(req, p) {
  if (req.adminRole === "ADMIN") return true;
  if (req.adminRole === "PLAYER") return req.athleteId && String(p.athlete) === String(req.athleteId);
  return p.team === req.adminTeam;
}

const view = (p) => ({
  status: p.status,
  kind: p.kind || "FEE",
  amount: p.amount,
  currency: p.currency || "USD",
  qr: p.status === "PENDING" ? p.qr : "",
  md5: p.reference,
  expiresAt: p.expiresAt,
  label: p.label,
  paidAt: p.paidAt,
  fromAccount: p.fromAccount,
  tournament: p.tournament,
});

// POST /api/bakong/payment/create  { athleteId, assignmentId, amount? }
// KHQR (in US dollars) for what this athlete owes on that team (or part of it).
exports.createBakongPayment = async (req, res) => {
  try {
    const { athleteId, assignmentId, amount } = req.body;
    const { athlete, assignment, error } = await findAssignmentForBakong(req, athleteId, assignmentId);
    if (error) return res.status(error[0]).json({ message: error[1] });
    const p = await fees.createFeeQr({ athlete, assignment, amount, by: req.adminId });
    res.json({ ...view(p), feeOwed: feeOwedOf(assignment) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// POST /api/bakong/tournament/create  { tournamentId, registrationId }
// KHQR for the unpaid part of one registration's entry fee. Admin, the
// team's Head Coach, or the player themself.
exports.createTournamentPayment = async (req, res) => {
  try {
    const t = await Tournament.findById(req.body.tournamentId);
    if (!t) return res.status(404).json({ message: "Tournament not found" });
    const row = t.registrations.id(req.body.registrationId);
    if (!row) return res.status(404).json({ message: "Registration not found" });
    const allowed =
      req.adminRole === "ADMIN" ||
      (req.adminRole === "PLAYER" ? String(row.athlete) === String(req.athleteId) : row.team === req.adminTeam);
    if (!allowed) return res.status(403).json({ message: "Access denied" });
    const p = await fees.createTournamentQr({ tournament: t, row, by: req.adminId });
    res.json(view(p));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/bakong/payment/:md5 — the QR to show + status (payment page).
exports.getBakongPayment = async (req, res) => {
  try {
    const p = await Payment.findOne({ reference: req.params.md5, method: "BAKONG" }).sort({ createdAt: -1 });
    if (!p) return res.status(404).json({ message: "Bakong payment not found" });
    if (!canSee(req, p)) return res.status(403).json({ message: "Access denied" });
    res.json(view(p));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/bakong/qr-image?md5=... — PNG of the QR (made locally).
exports.getBakongQrImage = async (req, res) => {
  try {
    const md5 = req.query.md5 || (req.body && req.body.md5);
    if (!md5) return res.status(400).json({ message: "md5 is required" });
    const p = await Payment.findOne({ reference: md5, method: "BAKONG" }).sort({ createdAt: -1 });
    if (!p || !p.qr) return res.status(404).json({ message: "Bakong payment not found" });
    if (!canSee(req, p)) return res.status(403).json({ message: "Access denied" });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    res.send(await pay.qrPng(p.qr));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/bakong/check-transaction  { md5 }
// Ask Bakong now (at most every 4 s per payment); returns the status.
const lastCheck = new Map();
exports.checkBakongTransaction = async (req, res) => {
  try {
    const { md5 } = req.body;
    if (!md5) return res.status(400).json({ message: "md5 is required" });
    let p = await Payment.findOne({ reference: md5, method: "BAKONG" }).sort({ createdAt: -1 });
    if (!p) return res.status(404).json({ message: "Bakong payment not found" });
    if (!canSee(req, p)) return res.status(403).json({ message: "Access denied" });
    if (p.status === "PENDING" && Date.now() - (lastCheck.get(md5) || 0) > 4000) {
      lastCheck.set(md5, Date.now());
      const r = await fees.runFeeChecks({ ids: [p._id] });
      p = await Payment.findById(p._id);
      if (r.error && p.status === "PENDING") return res.json({ ...view(p), checkError: r.error });
    }
    res.json(view(p));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/bakong/mark-paid { md5 } — Admin / Head Coach saw the money
// arrive (bank app) but Bakong can't be checked: apply it by hand.
exports.markBakongPaid = async (req, res) => {
  try {
    const p = await Payment.findOne({ reference: req.body.md5, method: "BAKONG" }).sort({ createdAt: -1 });
    if (!p) return res.status(404).json({ message: "Bakong payment not found" });
    if (req.adminRole === "PLAYER" || !canSee(req, p)) return res.status(403).json({ message: "Access denied" });
    const r = await fees.applyPaid(p._id, { by: req.adminId });
    res.json({ already: Boolean(r.already), ...view(await Payment.findById(p._id)) });
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


