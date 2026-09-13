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
  addFee,
  updateFee,
  removeFee,
  renewVerification,
  getScanLogs,
  getStats,
  exportRosterCsv,
  bulkApproveAssignments,
  deleteAthlete,
  verifyAthlete,
  searchAthletes,
  checkDuplicateName,
} = require("../controllers/athleteController");

// Public - this is what the QR code links to. No login required.
router.get("/verify/:verifyId", verifyAthlete);
// Public - lets anyone find a player by name or ID number without scanning anything.
router.get("/search", searchAthletes);

// Signed-in below this line. A Head Coach/Player is scoped to just their
// own team by the controller (see athleteController.js) — every route here
// is shared rather than duplicated under /api/coach/*, since the access
// rules differ only in *which* records/assignments each role can touch,
// not in the actions themselves.
router.use(requireAuth);

// Read-only — Admin (every team), Head Coach and Player (both forced to
// their own team by the controller) can all view. A Player account is NEVER
// allowed past this point — every route below is Admin/Head Coach only, so
// a shared player login can look but never touch anything.
router.get("/", requireRole("ADMIN", "HEAD_COACH", "PLAYER"), getAllAthletes);
// These bare paths must stay above /:id and /bulk-approve above /:id for
// PUT — otherwise Express swallows them as an :id param instead.
router.get("/check-duplicate", requireRole("ADMIN", "HEAD_COACH"), checkDuplicateName);
router.get("/stats", requireRole("ADMIN", "HEAD_COACH"), getStats);
router.get("/export.csv", requireRole("ADMIN", "HEAD_COACH"), exportRosterCsv);
router.put("/bulk-approve", requireRole("ADMIN"), bulkApproveAssignments);
router.get("/:id", requireRole("ADMIN", "HEAD_COACH", "PLAYER"), getAthleteById);
router.get("/:id/scan-logs", requireRole("ADMIN", "HEAD_COACH"), getScanLogs);

router.post(
  "/",
  requireRole("ADMIN", "HEAD_COACH"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  createAthlete
);
router.put(
  "/:id",
  requireRole("ADMIN", "HEAD_COACH"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  updateAthlete
);
router.put("/:id/renew", requireRole("ADMIN", "HEAD_COACH"), renewVerification);

// Team/role assignments — a person can have several, one per team (or even
// several on the same team, e.g. Player + Assistant Coach). Add/edit/remove
// act on ONE assignment at a time; approve/reject (admin-only) are how an
// Admin signs off on a Head Coach's pending add or pending removal request.
router.post("/:id/assignments", requireRole("ADMIN", "HEAD_COACH"), addAssignment);
router.put("/:id/assignments/:assignmentId", requireRole("ADMIN", "HEAD_COACH"), updateAssignment);
router.delete("/:id/assignments/:assignmentId", requireRole("ADMIN", "HEAD_COACH"), removeAssignment);
router.put("/:id/assignments/:assignmentId/approve", requireRole("ADMIN"), approveAssignment);
router.put("/:id/assignments/:assignmentId/reject", requireRole("ADMIN"), rejectAssignment);

// Fee/debt rows on one assignment — several can exist at once (e.g.
// "Uniform fee: $10" and "2026 registration: $15"), each added/edited/
// removed independently. Same Admin/Head Coach (own team) access as the
// assignment routes above; a Player account only ever GETs this data via
// the flattened total + breakdown, never through these.
router.post("/:id/assignments/:assignmentId/fees", requireRole("ADMIN", "HEAD_COACH"), addFee);
router.put("/:id/assignments/:assignmentId/fees/:feeId", requireRole("ADMIN", "HEAD_COACH"), updateFee);
router.delete("/:id/assignments/:assignmentId/fees/:feeId", requireRole("ADMIN", "HEAD_COACH"), removeFee);

// Admin-only — a Head Coach removes someone through the assignment routes
// above instead (which always requires Admin confirmation, per team).
router.delete("/:id", requireRole("ADMIN"), deleteAthlete);

module.exports = router;
