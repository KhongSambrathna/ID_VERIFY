const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const {
  listAttendance,
  attendanceSummary,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
} = require("../controllers/attendanceController");

// Attendance recording is a staff (Admin/Head Coach) squad-management tool,
// so it's gated behind the team's plan subscription exactly like squad
// lists / formations / starting XI — requireActiveSubscription is a no-op
// for Admin and only blocks a Head Coach whose own team's plan has lapsed.
// Only Admin/Head Coach ever reach these routes.
router.use(requireAuth, requireActiveSubscription);

// Bare "/summary" above "/:id", same reasoning as tournamentRoutes/athleteRoutes.
router.get("/summary", requireRole("ADMIN", "HEAD_COACH"), attendanceSummary);
router.get("/", requireRole("ADMIN", "HEAD_COACH"), listAttendance);
router.post("/", requireRole("ADMIN", "HEAD_COACH"), createAttendance);
router.get("/:id", requireRole("ADMIN", "HEAD_COACH"), getAttendance);
router.put("/:id", requireRole("ADMIN", "HEAD_COACH"), updateAttendance);
router.delete("/:id", requireRole("ADMIN", "HEAD_COACH"), deleteAttendance);

module.exports = router;
