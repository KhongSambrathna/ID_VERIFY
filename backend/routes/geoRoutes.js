const express = require("express");
const router = express.Router();
const { getChildren, lookup } = require("../utils/gazetteer");

// Public, read-only — Cambodia province/district/commune/village lists for
// the address picker (also used on the self-registration invite page,
// which has no login). Same data for everyone, so cache it in the browser.
router.use((req, res, next) => {
  res.set("Cache-Control", "public, max-age=86400");
  next();
});

// GET /api/geo/children            → provinces
// GET /api/geo/children/:code      → districts / communes / villages under it
router.get("/children", (req, res) => res.json(getChildren(null)));
router.get("/children/:code", (req, res) => {
  if (!/^\d{2,6}$/.test(req.params.code)) return res.status(400).json({ message: "Invalid code" });
  res.json(getChildren(req.params.code));
});

// GET /api/geo/lookup/:code → { province, district, commune, village }
router.get("/lookup/:code", (req, res) => {
  const chain = lookup(req.params.code);
  if (!chain) return res.status(404).json({ message: "Unknown area code" });
  res.json(chain);
});

module.exports = router;
