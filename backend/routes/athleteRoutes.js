const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  createAthlete,
  getAllAthletes,
  getAthleteById,
  updateAthlete,
  addAssignment,
  updateAssignment,
  removeAssignment,
  approveAssignment,
  rejectAssignment,
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
// the access rules differ only in *which* records/assignments each role
// can touch, not in the actions themselves.
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

// Team/role assignments — a person can have several, one per team (or even
// several on the same team, e.g. Player + Assistant Coach). Add/edit/remove
// act on ONE assignment at a time; approve/reject (admin-only) are how an
// Admin signs off on a Head Coach's pending add or pending removal request.
router.post("/:id/assignments", addAssignment);
router.put("/:id/assignments/:assignmentId", updateAssignment);
router.delete("/:id/assignments/:assignmentId", removeAssignment);
router.put("/:id/assignments/:assignmentId/approve", requireRole("ADMIN"), approveAssignment);
router.put("/:id/assignments/:assignmentId/reject", requireRole("ADMIN"), rejectAssignment);

// Admin-only — a Head Coach removes someone through the assignment routes
// above instead (which always requires Admin confirmation, per team).
router.delete("/:id", requireRole("ADMIN"), deleteAthlete);

module.exports = router;
