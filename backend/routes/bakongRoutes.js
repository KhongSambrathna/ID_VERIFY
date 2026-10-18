const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  createBakongPayment,
  getBakongQrImage,
  checkBakongTransaction,
  recordBakongPayment,
} = require("../controllers/bakongController");

router.use(requireAuth);

// Any signed-in role can start a Bakong payment — the controller restricts a
// non-Admin to their own team's assignment, same as the fees endpoints.
router.post("/payment/create", createBakongPayment);

// Proxy for Bakong's QR-image endpoint (returns PNG). Query: ?md5=...
router.get("/qr-image", getBakongQrImage);

// Server-to-server verification with Bakong; credits fees when paid.
router.post("/check-transaction", checkBakongTransaction);

// Manual record of a Bakong payment — Admin / Head Coach only.
router.post("/record", requireRole("ADMIN", "HEAD_COACH"), recordBakongPayment);

module.exports = router;
