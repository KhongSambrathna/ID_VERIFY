const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  createAthlete,
  getAllAthletes,
  getAthleteById,
  updateAthlete,
  approveAthlete,
  deleteAthlete,
  verifyAthlete,
  searchAthletes,
  checkDuplicateName,
} = require("../controllers/athleteController");

// Public - this is what the QR code links to. No login required.
router.get("/verify/:verifyId", verifyAthlete);
// Public - lets anyone find a player by name or ID number without scanning anything.
router.get("/search", searchAthletes);

// Admin and Head Coach below this line. A Head Coach is scoped to just
// their own team by the controller (see athleteController.js) — every
// route here is shared rather than duplicated under /api/coach/*, since
// the access rules differ only in *which* records each role can touch,
// not in the actions themselves.
router.use(requireAuth, requireRole("ADMIN", "HEAD_COACH"));

router.get("/", getAllAthletes);
// must stay above /:id — otherwise "check-duplicate" gets swallowed as an :id
router.get("/check-duplicate", checkDuplicateName);
router.get("/:id", getAthleteById);
router.post(
  "/",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  createAthlete
);
router.put(
  "/:id",
  upload.fields([{ name: "photo", maxCount: 1 }]),
  updateAthlete
);
// Admin-only, even though everything above this line is shared — approving
// is deliberately not something a Head Coach can do to their own submission.
router.put("/:id/approve", requireRole("ADMIN"), approveAthlete);
router.delete("/:id", deleteAthlete);

module.exports = router;
