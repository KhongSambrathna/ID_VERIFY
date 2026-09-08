const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  register,
  login,
  listUsers,
  createUser,
  deleteUser,
} = require("../controllers/authController");

// Public
router.post("/register", register); // bootstrap only — see controller
router.post("/login", login);

// Admin only — managing other login accounts (Head Coach, additional Admins)
router.get("/users", requireAuth, requireRole("ADMIN"), listUsers);
router.post("/users", requireAuth, requireRole("ADMIN"), createUser);
router.delete("/users/:id", requireAuth, requireRole("ADMIN"), deleteUser);

module.exports = router;
