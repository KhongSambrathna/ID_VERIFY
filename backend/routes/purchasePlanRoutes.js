const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  receivePlan,
} = require("../controllers/purchasePlanController");

// Purchase planning (Admin only).
router.use(requireAuth, requireRole("ADMIN"));
router.get("/", listPlans);
router.post("/", createPlan);
router.get("/:id", getPlan);
router.put("/:id", updatePlan);
router.delete("/:id", deletePlan);
router.post("/:id/receive", receivePlan);

module.exports = router;
