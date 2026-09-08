const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const Athlete = require("../models/Athlete");
const Lineup = require("../models/Lineup");
const Formation = require("../models/Formation");

// Both Admins and Head Coaches manage match-day squad lists and formations.
// A Head Coach is scoped to their own team (req.adminTeam); an Admin picks
// any team explicitly (req.body.team on create, req.query.team on list).
// Once something belongs to a team, anyone with access to that team can see
// and edit it — Admins always, Head Coaches only for their own team — this
// is deliberately not tied to who originally created it, since squad lists
// and formations are shared team resources, not personal to one account.
function resolveTeam(req) {
  return req.adminRole === "ADMIN" ? (req.body.team || req.query.team || "").trim() : req.adminTeam;
}

function canAccessTeam(req, team) {
  return req.adminRole === "ADMIN" || team === req.adminTeam;
}

// ============ ATHLETE MANAGEMENT ============

// GET /api/coach/my-team
// Head Coach gets athletes in their team. (Admins use GET /api/athletes?team=X instead.)
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

// ============ SQUAD LIST (LINEUP) MANAGEMENT ============
// "Lineup" here means the full match-day squad list (players + head coach +
// assistant coach + medic, typically 15-22 people) — not the tactical pitch
// formation, which is the separate Formation resource below.

router.post("/lineup", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });

    const { name, athletes, notes } = req.body;
    const lineup = new Lineup({
      coachId: req.adminId,
      team,
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

router.get("/lineups", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, team)) return res.status(403).json({ message: "Access denied" });

    const lineups = await Lineup.find({ team }).populate("athletes.athleteId").sort({ createdAt: -1 });
    res.json(lineups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/lineup/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const lineup = await Lineup.findById(req.params.id).populate("athletes.athleteId");
    if (!lineup) return res.status(404).json({ message: "Lineup not found" });
    if (!canAccessTeam(req, lineup.team)) return res.status(403).json({ message: "Access denied" });

    res.json(lineup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/lineup/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const lineup = await Lineup.findById(req.params.id);
    if (!lineup) return res.status(404).json({ message: "Lineup not found" });
    if (!canAccessTeam(req, lineup.team)) return res.status(403).json({ message: "Access denied" });

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

router.delete("/lineup/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const lineup = await Lineup.findById(req.params.id);
    if (!lineup) return res.status(404).json({ message: "Lineup not found" });
    if (!canAccessTeam(req, lineup.team)) return res.status(403).json({ message: "Access denied" });

    await Lineup.findByIdAndDelete(req.params.id);
    res.json({ message: "Lineup deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============ FORMATION (TACTICAL POSTER) MANAGEMENT ============
// Players positioned on a pitch diagram for a specific match, saved as JPG.

router.post("/formation", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });

    const { name, positions } = req.body;
    const formation = new Formation({
      createdBy: req.adminId,
      team,
      name,
      positions: positions || [],
    });

    await formation.save();
    await formation.populate("positions.athleteId");

    res.status(201).json(formation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/formations", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, team)) return res.status(403).json({ message: "Access denied" });

    const formations = await Formation.find({ team })
      .populate("positions.athleteId")
      .sort({ createdAt: -1 });
    res.json(formations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/formation/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id).populate("positions.athleteId");
    if (!formation) return res.status(404).json({ message: "Formation not found" });
    if (!canAccessTeam(req, formation.team)) return res.status(403).json({ message: "Access denied" });

    res.json(formation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/formation/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: "Formation not found" });
    if (!canAccessTeam(req, formation.team)) return res.status(403).json({ message: "Access denied" });

    const { name, positions } = req.body;
    if (name !== undefined) formation.name = name;
    if (positions !== undefined) formation.positions = positions;

    await formation.save();
    await formation.populate("positions.athleteId");

    res.json(formation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/formation/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const formation = await Formation.findById(req.params.id);
    if (!formation) return res.status(404).json({ message: "Formation not found" });
    if (!canAccessTeam(req, formation.team)) return res.status(403).json({ message: "Access denied" });

    await Formation.findByIdAndDelete(req.params.id);
    res.json({ message: "Formation deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
