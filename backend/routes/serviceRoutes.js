const express = require("express");
const router = express.Router();
const { getServicePricing } = require("../controllers/serviceController");

// Public — no requireAuth. This is a marketing/pricing page, same spirit
// as GET /api/products/public for the Shop.
router.get("/pricing", getServicePricing);

module.exports = router;
