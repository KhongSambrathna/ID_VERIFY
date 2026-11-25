const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const c = require("../controllers/telegramController");

// ID Telegram bot (accounts). The shop bot, its orders, the Mini App and
// KHQR settings are in the shop app now.
router.post("/webhook/:secret", c.webhook);
router.get("/tick", c.tick);
router.get("/public", c.publicInfo);

router.use(requireAuth, requireRole("ADMIN"));
router.get("/status", c.status);
router.post("/setup", c.setup);
router.post("/link", c.linkCode);
router.delete("/link", c.unlink);
router.post("/test", c.test);

module.exports = router;
