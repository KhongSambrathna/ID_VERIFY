const express = require("express");
const router = express.Router();
const requireLinkKey = require("../middleware/linkKey");
const { listTeams, getTeam, pushTeams } = require("../controllers/linkController");
const { trainingForSchoolStudent } = require("../controllers/linkTrainingController");

// App-link API for your other apps (Tournament, Shop) — read, plus
// Tournament may send its teams here (POST /teams/push).
// Every call needs the X-Link-Key header (see middleware/linkKey.js).
router.use(requireLinkKey);
router.get("/teams", listTeams);
router.post("/teams/push", pushTeams);
router.get("/teams/:id", getTeam);
// school-management app: one student's own training (🏃) — see linkTrainingController
router.get("/training/school-student/:id", trainingForSchoolStudent);

module.exports = router;
