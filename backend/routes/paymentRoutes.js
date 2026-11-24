const express = require("express");
const router = express.Router();
const { coachCan } = require("../middleware/coachPerms");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  recordCashPayment,
  listPayments,
} = require("../controllers/paymentController");

router.use(requireAuth);

// Recording a cash payment received in person is an Admin/Head Coach
// action only — same restriction as adding/editing a fee.
router.post("/cash", requireRole("ADMIN", "HEAD_COACH"), coachCan("debts"), recordCashPayment);

router.get("/:athleteId/:assignmentId", listPayments);

module.exports = router;
