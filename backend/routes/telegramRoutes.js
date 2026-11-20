const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const c = require("../controllers/telegramController");

// Public: Telegram's webhook, the cron "tick", and the bot username.
router.post("/webhook/:secret", c.webhook);
router.get("/tick", c.tick);
router.get("/public", c.publicInfo);

// Admin only.
router.use(requireAuth, requireRole("ADMIN"));
router.get("/status", c.status);
router.post("/setup", c.setup);
router.post("/link", c.linkCode);
router.delete("/link", c.unlink);
router.put("/alerts", c.updateAlerts);
router.post("/test", c.test);
router.post("/run-now", c.runNow);
router.get("/orders", c.listOrders);
router.post("/orders/:id/confirm", c.confirmOrder);
router.post("/orders/:id/reject", c.rejectOrder);

module.exports = router;
