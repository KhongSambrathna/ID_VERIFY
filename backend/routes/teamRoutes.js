const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  listTeams,
  createTeam,
  deleteTeam,
  listPlans,
  getMySubscription,
  getMyKhqr,
  uploadMyKhqr,
  removeMyKhqr,
  recordSubscriptionPayment,
  revokeSubscription,
} = require("../controllers/teamController");

// The plan/pricing table, a Head Coach's own subscription status, and the
// "my team" KHQR routes are all kept above the blanket Admin-only gate
// below so they aren't swallowed by it. The pricing table itself is fully
// public (no auth) — it's shown on the public Pricing page
// (frontend/src/pages/PricingPage.jsx) as well as inside the app.
router.get("/plans", listPlans);
router.get("/mine/subscription", requireAuth, requireRole("HEAD_COACH"), getMySubscription);

// A team's static ABA Merchant KHQR image ("scan to pay" — see the Team
// model comment for why this exists instead of full PayWay API access).
// Read access also includes PLAYER (own team) since that's who actually
// needs to see it to pay; only the Head Coach can upload/remove it.
router.get("/mine/khqr", requireAuth, requireRole("HEAD_COACH", "PLAYER"), getMyKhqr);
router.put("/mine/khqr", requireAuth, requireRole("HEAD_COACH"), upload.single("khqr"), uploadMyKhqr);
router.delete("/mine/khqr", requireAuth, requireRole("HEAD_COACH"), removeMyKhqr);

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listTeams);
router.post("/", createTeam);
router.delete("/:id", deleteTeam);
router.post("/:id/subscription", recordSubscriptionPayment);
router.post("/:id/subscription/revoke", revokeSubscription);

module.exports = router;
