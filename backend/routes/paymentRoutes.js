const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  createAbaPayment,
  confirmAbaPayment,
  recordCashPayment,
  listPayments,
} = require("../controllers/paymentController");

router.use(requireAuth);

// Any signed-in role (Admin, Head Coach, Player) can start/confirm an ABA
// payment — the controller itself restricts a non-Admin to their own
// team's assignment, same as the fees endpoints.
router.post("/aba/create", createAbaPayment);
router.post("/aba/confirm", confirmAbaPayment);

// Recording a cash payment received in person is an Admin/Head Coach
// action only — same restriction as adding/editing a fee.
router.post("/cash", requireRole("ADMIN", "HEAD_COACH"), recordCashPayment);

router.get("/:athleteId/:assignmentId", listPayments);

module.exports = router;
