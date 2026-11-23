const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const c = require("../controllers/telegramController");

// Public: Telegram's webhook, the cron "tick", and the bot username.
router.post("/webhook/:secret", c.webhook);
router.get("/tick", c.tick);
router.get("/public", c.publicInfo);
// Telegram Mini App (/tg-shop) — checked with Telegram's signed initData.
router.post("/webapp/session", c.webAppSession);
router.post("/webapp/order", c.webAppOrder);
router.post("/webapp/payment", c.webAppPayment);

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
router.post("/orders/:id/check-payment", c.checkOrderPayment);
router.post("/orders/:id/mark-paid", c.markOrderPaid);
// KHQR payment settings
router.get("/pay-settings", c.getPaySettings);
router.put("/pay-settings", c.updatePaySettings);
router.post("/pay-settings/test", c.testPaySettings);

module.exports = router;
