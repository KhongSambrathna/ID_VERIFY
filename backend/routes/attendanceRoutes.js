const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listAttendance,
  attendanceSummary,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
} = require("../controllers/attendanceController");

// Attendance recording is a staff (Admin/Head Coach) squad-management tool.
// No longer gated behind a team's subscription.
router.use(requireAuth);

// Bare "/summary" above "/:id", same reasoning as tournamentRoutes/athleteRoutes.
router.get("/summary", requireRole("ADMIN", "HEAD_COACH"), attendanceSummary);
router.get("/", requireRole("ADMIN", "HEAD_COACH"), listAttendance);
router.post("/", requireRole("ADMIN", "HEAD_COACH"), createAttendance);
router.get("/:id", requireRole("ADMIN", "HEAD_COACH"), getAttendance);
router.put("/:id", requireRole("ADMIN", "HEAD_COACH"), updateAttendance);
router.delete("/:id", requireRole("ADMIN", "HEAD_COACH"), deleteAttendance);

module.exports = router;
