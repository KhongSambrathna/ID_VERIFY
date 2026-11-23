const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listPackages,
  listPublicPackages,
  createPackage,
  updatePackage,
  deletePackage,
  duplicatePackage,
} = require("../controllers/packageController");

// Public — shown on the /shop page.
router.get("/public", listPublicPackages);

// Admin only.
router.use(requireAuth, requireRole("ADMIN"));
router.get("/", listPackages);
router.post("/", createPackage);
router.put("/:id", updatePackage);
router.post("/:id/duplicate", duplicatePackage);
router.delete("/:id", deletePackage);

module.exports = router;
