const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  createTournament,
  listTournaments,
  getTournament,
  updateTournament,
  deleteTournament,
  registerSelf,
  registerOnBehalf,
  unregister,
  setRegistrationPaid,
  settleTournamentNow,
  setRegistrationClosed,
  exportRegistrationsCsv,
} = require("../controllers/tournamentController");

router.use(requireAuth);

// Bare paths above /:id, same reasoning as athleteRoutes.js.
router.get("/", requireRole("ADMIN", "HEAD_COACH", "PLAYER"), listTournaments);
router.post("/", requireRole("ADMIN", "HEAD_COACH"), createTournament);
router.get("/:id", requireRole("ADMIN", "HEAD_COACH", "PLAYER"), getTournament);
router.put("/:id", requireRole("ADMIN", "HEAD_COACH"), updateTournament);
router.delete("/:id", requireRole("ADMIN", "HEAD_COACH"), deleteTournament);
router.get("/:id/export.csv", requireRole("ADMIN", "HEAD_COACH"), exportRegistrationsCsv);

// Self-registration — individual Player login only (the controller checks
// req.athleteId is actually set; a legacy shared team login gets a clear
// error instead of a 403 with no explanation).
router.post("/:id/register", requireRole("PLAYER"), registerSelf);
router.delete("/:id/registrations/:registrationId", requireRole("ADMIN", "HEAD_COACH", "PLAYER"), unregister);

// Admin/Head Coach registering someone who has no login of their own.
router.post("/:id/register-admin", requireRole("ADMIN", "HEAD_COACH"), registerOnBehalf);

// Note "paid their entry fee on match day" / force-settle unpaid → debt.
router.patch("/:id/registrations/:registrationId/paid", requireRole("ADMIN", "HEAD_COACH"), setRegistrationPaid);
router.post("/:id/settle-debts", requireRole("ADMIN", "HEAD_COACH"), settleTournamentNow);

// Open/close self-service registration for this tournament.
router.patch("/:id/registration-status", requireRole("ADMIN", "HEAD_COACH"), setRegistrationClosed);

module.exports = router;
