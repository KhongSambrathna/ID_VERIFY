const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");
const c = require("../controllers/chatController");

// 💬 Chat — every signed-in account. Same team: chat directly; another
// team: friend request first; Admin: anyone.
router.use(requireAuth);
router.get("/people", c.people);
router.post("/friends", c.requestFriend);
router.post("/friends/:id/accept", c.acceptFriend);
router.post("/friends/:id/decline", c.declineFriend);
router.delete("/friends/:userId", c.unfriend);
router.get("/unread", c.unread);
router.get("/conversations", c.conversations);
router.post("/conversations", c.open);
router.get("/conversations/:id/messages", c.messages);
router.post("/conversations/:id/messages", c.send);
router.post("/conversations/:id/read", c.markRead);
router.delete("/conversations/:id", c.hide);
router.delete("/messages/:id", c.deleteMessage);

module.exports = router;
