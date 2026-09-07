const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/auth");
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

// Admin only, below this line
router.use(requireAuth);

router.get("/", getAllAthletes);
router.get("/:id", getAthleteById);
router.post(
  "/",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documents", maxCount: 10 },
  ]),
  createAthlete
);
router.put("/:id", updateAthlete);
router.delete("/:id", deleteAthlete);

module.exports = router;
