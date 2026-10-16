const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const upload = require("../middleware/upload");
const {
  createInvite,
  listInvites,
  revokeInvite,
  getInviteByToken,
  registerViaInvite,
  checkDuplicate,
  claimExisting,
  getStats,
} = require("../controllers/registrationController");

// ---- PUBLIC (no login) — the player-facing side of a shared link. ----
// These MUST stay above the requireAuth gate below, or a player with no
// account (the whole point — they haven't registered yet) couldn't reach them.
// The token in the URL is the only thing that authorizes these. A link may
// serve one player or many (see RegistrationInvite.maxUses / usesLeft); an
// unlimited shared link stays usable for every teammate. A player submitting
// their details needs the same photo/documents upload the staff add-athlete
// form uses.
router.get("/invites/:token", getInviteByToken);
router.post(
  "/invites/:token",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  registerViaInvite
);
// Duplicate-name search on the public form (English name only), and the
// "this is me — add me to this team" action that attaches a pending
// assignment to an existing, already-public athlete instead of creating a
// duplicate. Both stay above the requireAuth gate below for the same reason
// as the routes above — the person using them has no account yet.
router.get("/invites/:token/check-duplicate", checkDuplicate);
router.post("/invites/:token/claim/:athleteId", claimExisting);

// ---- Coach/Admin — managing the links themselves. ----
// Creating/sending a registration link is a roster-management action for a
// Head Coach, so it's gated behind their team's active subscription exactly
// like adding an athlete directly is (requireActiveSubscription is a no-op for
// Admin). Listing/revoking is lighter bookkeeping and stays open, so a lapsed
// team can still cancel links they already sent.
router.use(requireAuth);

router.get("/invites", requireRole("ADMIN", "HEAD_COACH"), listInvites);
// Creating a registration link is an Admin-only roster action: only an Admin
// issues links (and picks the existing team they register into). Head
// Coaches can still list/revoke their own team's links below.
router.post("/invites", requireRole("ADMIN"), requireActiveSubscription, createInvite);
router.delete("/invites/:id", requireRole("ADMIN", "HEAD_COACH"), revokeInvite);

// Admin registration statistics — lots of data for the dashboard:
// invite counts, registration counts, pending approvals, per-team breakdown,
// and the most recent sign-ups.
router.get("/stats", requireRole("ADMIN"), getStats);

module.exports = router;
