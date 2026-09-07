const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  createAthlete,
  getAllAthletes,
  getAthleteById,
  updateAthlete,
  deleteAthlete,
  verifyAthlete,
} = require("../controllers/athleteController");

// Public - this is what the QR code links to
router.get("/verify/:verifyId", verifyAthlete);

// Admin/Coach auth required below
router.use(requireAuth);

router.get("/", getAllAthletes);
router.get("/:id", getAthleteById);

// Only ADMIN can create athletes
router.post(
  "/",
  requireRole("ADMIN"),
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  createAthlete
);

// Only ADMIN can update/delete athletes
router.put("/:id", requireRole("ADMIN"), updateAthlete);
router.delete("/:id", requireRole("ADMIN"), deleteAthlete);

module.exports = router;
