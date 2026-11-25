const express = require("express");
const router = express.Router();
const requireLinkKey = require("../middleware/linkKey");
const { listTeams, getTeam } = require("../controllers/linkController");

// App-link API for your other apps (Tournament, Shop) — read-only.
// Every call needs the X-Link-Key header (see middleware/linkKey.js).
router.use(requireLinkKey);
router.get("/teams", listTeams);
router.get("/teams/:id", getTeam);

module.exports = router;
