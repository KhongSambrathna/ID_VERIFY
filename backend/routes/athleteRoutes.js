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
  searchAthletes,
} = require("../controllers/athleteController");

// Public - this is what the QR code links to. No login required.
router.get("/verify/:verifyId", verifyAthlete);
// Public - lets anyone find a player by name or ID without scanning anything.
router.get("/search", searchAthletes);

// Admin only, below this line — Head Coach accounts use /api/coach/* instead,
// which is scoped to just their own team's roster.
router.use(requireAuth, requireRole("ADMIN"));

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
router.put(
  "/:id",
  upload.fields([{ name: "photo", maxCount: 1 }]),
  updateAthlete
);
router.delete("/:id", deleteAthlete);

module.exports = router;
