const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  register,
  login,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listPlayerAccounts,
  generatePlayerAccounts,
  resetPlayerPassword,
  changePassword,
  forgotPassword,
  updateMyTelegram,
  me,
} = require("../controllers/authController");

// Public
router.post("/register", register); // bootstrap only — see controller
router.post("/login", login);
router.post("/forgot-password", forgotPassword); // Telegram-based self-service reset

// Any signed-in account — self-service, not tied to a role
router.get("/me", requireAuth, me);
router.post("/change-password", requireAuth, changePassword);
router.put("/me/telegram", requireAuth, updateMyTelegram);

// Admin only — managing other login accounts (Head Coach, additional Admins)
router.get("/users", requireAuth, requireRole("ADMIN"), listUsers);
router.post("/users", requireAuth, requireRole("ADMIN"), createUser);
router.put("/users/:id", requireAuth, requireRole("ADMIN"), updateUser);
router.delete("/users/:id", requireAuth, requireRole("ADMIN"), deleteUser);

// Individual per-athlete Player logins (tournament self-registration).
// Bare "/generate" must stay above "/:id/reset-password" — same Express
// route-ordering reasoning as everywhere else in this app.
router.get("/player-accounts", requireAuth, requireRole("ADMIN", "HEAD_COACH"), listPlayerAccounts);
router.post("/player-accounts/generate", requireAuth, requireRole("ADMIN"), generatePlayerAccounts);
router.put(
  "/player-accounts/:id/reset-password",
  requireAuth,
  requireRole("ADMIN", "HEAD_COACH"),
  resetPlayerPassword
);

module.exports = router;
