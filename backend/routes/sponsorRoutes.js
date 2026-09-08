const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  listSponsors,
  createSponsor,
  updateSponsor,
  deleteSponsor,
} = require("../controllers/sponsorController");

// public — the Landing/About "Trusted by" strip reads this without logging in
router.get("/", listSponsors);

router.use(requireAuth, requireRole("ADMIN"));
router.post("/", upload.fields([{ name: "logo", maxCount: 1 }]), createSponsor);
router.put("/:id", upload.fields([{ name: "logo", maxCount: 1 }]), updateSponsor);
router.delete("/:id", deleteSponsor);

module.exports = router;
