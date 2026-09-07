const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const Athlete = require("../models/Athlete");
const Lineup = require("../models/Lineup");

// ============ ATHLETE MANAGEMENT ============

// GET /api/coach/my-team
// Head Coach gets athletes in their team
router.get("/my-team", requireAuth, requireRole("HEAD_COACH"), async (req, res) => {
  try {
    const athletes = await Athlete.find({ team: req.adminTeam }).select(
      "fullName khmerName dateOfBirth gender photoUrl team role verifyId _id isAvailable"
    );
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ LINEUP MANAGEMENT ============

// POST /api/coach/lineup
// Create a new lineup
router.post("/lineup", requireAuth, requireRole("HEAD_COACH"), async (req, res) => {
  try {
    const { name, athletes, notes } = req.body;

    const lineup = new Lineup({
      coachId: req.adminId,
      team: req.adminTeam,
      name,
      athletes: athletes || [],
      notes,
    });

    await lineup.save();
    await lineup.populate("athletes.athleteId");

    res.status(201).json(lineup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/coach/lineups
// Get all lineups for this coach
router.get("/lineups", requireAuth, requireRole("HEAD_COACH"), async (req, res) => {
  try {
    const lineups = await Lineup.find({
      coachId: req.adminId,
      team: req.adminTeam,
    }).populate("athletes.athleteId");

    res.json(lineups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/coach/lineup/:id
// Get single lineup with athlete details
router.get("/lineup/:id", requireAuth, requireRole("HEAD_COACH"), async (req, res) => {
  try {
    const lineup = await Lineup.findById(req.params.id).populate("athletes.athleteId");

    if (!lineup) return res.status(404).json({ message: "Lineup not found" });

    // Ensure coach owns this lineup
    if (lineup.coachId.toString() !== req.adminId.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(lineup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/coach/lineup/:id
// Update lineup (add/remove athletes, change name)
router.put("/lineup/:id", requireAuth, requireRole("HEAD_COACH"), async (req, res) => {
  try {
    const lineup = await Lineup.findById(req.params.id);

    if (!lineup) return res.status(404).json({ message: "Lineup not found" });

    // Ensure coach owns this lineup
    if (lineup.coachId.toString() !== req.adminId.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, athletes, notes } = req.body;

    if (name !== undefined) lineup.name = name;
    if (athletes !== undefined) lineup.athletes = athletes;
    if (notes !== undefined) lineup.notes = notes;

    await lineup.save();
    await lineup.populate("athletes.athleteId");

    res.json(lineup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/coach/lineup/:id
// Delete a lineup
router.delete("/lineup/:id", requireAuth, requireRole("HEAD_COACH"), async (req, res) => {
  try {
    const lineup = await Lineup.findById(req.params.id);

    if (!lineup) return res.status(404).json({ message: "Lineup not found" });

    // Ensure coach owns this lineup
    if (lineup.coachId.toString() !== req.adminId.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    await Lineup.findByIdAndDelete(req.params.id);

    res.json({ message: "Lineup deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;