const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  createBakongPayment,
  createTournamentPayment,
  getBakongPayment,
  getBakongQrImage,
  checkBakongTransaction,
  markBakongPaid,
  recordBakongPayment,
} = require("../controllers/bakongController");

router.use(requireAuth);

// KHQR for a student's owed fees (debts). Any signed-in role — the
// controller restricts a non-Admin to their own team's assignment.
router.post("/payment/create", createBakongPayment);

// KHQR for a tournament entry fee (Admin, the team's coach, or the player).
router.post("/tournament/create", createTournamentPayment);

// The QR + status for the payment page, and the QR as a PNG.
router.get("/payment/:md5", getBakongPayment);
router.get("/qr-image", getBakongQrImage);

// Check with Bakong now (also checked automatically every ~20 s).
router.post("/check-transaction", checkBakongTransaction);

// Mark a KHQR as paid by hand (saw it in the bank app) — Admin / Head Coach.
router.post("/mark-paid", requireRole("ADMIN", "HEAD_COACH"), markBakongPaid);

// Manual record of a Bakong payment — Admin / Head Coach only.
router.post("/record", requireRole("ADMIN", "HEAD_COACH"), recordBakongPayment);

module.exports = router;
