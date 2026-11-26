const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { coachCan } = require("../middleware/coachPerms");
const {
  listTeams,
  getSettings,
  updateSettings,
  summary,
  listPayments,
  createPayment,
  deletePayment,
} = require("../controllers/trainingFeeController");

// ថ្លៃហ្វឹកហាត់ — Admin / Head Coach. Money actions follow the team's
// "debts & payments" coach permission.
router.use(requireAuth, requireRole("ADMIN", "HEAD_COACH"));

router.get("/teams", requireRole("ADMIN"), listTeams);
router.get("/settings", getSettings);
router.put("/settings", coachCan("debts"), updateSettings);
router.get("/summary", summary);
router.get("/payments", listPayments);
router.post("/payments", coachCan("debts"), createPayment);
router.delete("/payments/:id", coachCan("debts"), deletePayment);

module.exports = router;
