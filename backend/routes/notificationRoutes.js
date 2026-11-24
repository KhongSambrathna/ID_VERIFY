const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const c = require("../controllers/notificationController");

// In-website notifications (🔔) — every signed-in account sees only its own.
router.use(requireAuth);
router.get("/", c.list);
router.get("/count", c.count);
router.post("/read-all", c.markAllRead);
router.post("/:id/read", c.markRead);
router.post("/:id/act", c.act);
router.delete("/", c.clearAll);

module.exports = router;
