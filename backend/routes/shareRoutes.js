const express = require("express");
const router = express.Router();
const { shareShop, shareVerify, shareHome } = require("../controllers/shareController");

// Public social-share preview pages — see shareController.js for why these
// exist. Paste these (not the plain frontend link) into Facebook/Telegram/
// etc. to get a real preview image instead of a generic one.
router.get("/", shareHome);
router.get("/shop", shareShop);
router.get("/verify/:verifyId", shareVerify);

module.exports = router;
