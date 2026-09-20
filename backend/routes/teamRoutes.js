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
  getTeamLogo,
  getMyLogo,
  uploadMyLogo,
  removeMyLogo,
  uploadTeamLogo,
  removeTeamLogo,
  recordSubscriptionPayment,
  revokeSubscription,
} = require("../controllers/teamController");

// The plan/pricing table, a Head Coach's own subscription status, the
// public team-logo lookup, and the "my team" KHQR/logo routes are all kept
// above the blanket Admin-only gate below so they aren't swallowed by it.
// The pricing table and the team-logo lookup are fully public (no auth) —
// the pricing table is shown on the public Pricing page
// (frontend/src/pages/PricingPage.jsx), and the logo lookup is what every
// ID card (IDCard.jsx) calls to show a team's crest next to its QR code.
router.get("/plans", listPlans);
router.get("/logo/:name", getTeamLogo);
router.get("/mine/subscription", requireAuth, requireRole("HEAD_COACH"), getMySubscription);

// A team's static ABA Merchant KHQR image ("scan to pay" — see the Team
// model comment for why this exists instead of full PayWay API access).
// Read access also includes PLAYER (own team) since that's who actually
// needs to see it to pay; only the Head Coach can upload/remove it.
router.get("/mine/khqr", requireAuth, requireRole("HEAD_COACH", "PLAYER"), getMyKhqr);
router.put("/mine/khqr", requireAuth, requireRole("HEAD_COACH"), upload.single("khqr"), uploadMyKhqr);
router.delete("/mine/khqr", requireAuth, requireRole("HEAD_COACH"), removeMyKhqr);

// This Head Coach's own team's crest — self-service upload/remove, same
// shape as the KHQR routes above.
router.get("/mine/logo", requireAuth, requireRole("HEAD_COACH"), getMyLogo);
router.put("/mine/logo", requireAuth, requireRole("HEAD_COACH"), upload.single("logo"), uploadMyLogo);
router.delete("/mine/logo", requireAuth, requireRole("HEAD_COACH"), removeMyLogo);

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listTeams);
router.post("/", createTeam);
router.delete("/:id", deleteTeam);
router.put("/:id/logo", upload.single("logo"), uploadTeamLogo);
router.delete("/:id/logo", removeTeamLogo);
router.post("/:id/subscription", recordSubscriptionPayment);
router.post("/:id/subscription/revoke", revokeSubscription);

module.exports = router;
