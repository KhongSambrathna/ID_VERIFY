const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listTeams,
  createTeam,
  deleteTeam,
  listPlans,
  getMySubscription,
  recordSubscriptionPayment,
  revokeSubscription,
} = require("../controllers/teamController");

// The plan/pricing table and a Head Coach's own subscription status are
// both kept above the blanket Admin-only gate below so they aren't
// swallowed by it. The pricing table itself is fully public (no auth) —
// it's shown on the public Pricing page (frontend/src/pages/PricingPage.jsx)
// as well as inside the app — and only a Head Coach ever needs their own
// team's subscription status.
router.get("/plans", listPlans);
router.get("/mine/subscription", requireAuth, requireRole("HEAD_COACH"), getMySubscription);

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listTeams);
router.post("/", createTeam);
router.delete("/:id", deleteTeam);
router.post("/:id/subscription", recordSubscriptionPayment);
router.post("/:id/subscription/revoke", revokeSubscription);

module.exports = router;
