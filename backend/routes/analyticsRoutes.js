const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { track, summary } = require("../controllers/analyticsController");

// Public — every visitor's browser reports the page it opened.
router.post("/track", track);

// Admin only — the analytics report.
router.get("/summary", requireAuth, requireRole("ADMIN"), summary);

module.exports = router;
