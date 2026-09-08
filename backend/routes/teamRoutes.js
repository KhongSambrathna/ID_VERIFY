const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { listTeams, createTeam, deleteTeam } = require("../controllers/teamController");

router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listTeams);
router.post("/", createTeam);
router.delete("/:id", deleteTeam);

module.exports = router;
