const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const Athlete = require("../models/Athlete");
const Lineup = require("../models/Lineup");
const Formation = require("../models/Formation");
const StartingXI = require("../models/StartingXI");

// A formation's players must come from an already-created Squad List
// (Lineup) belonging to the SAME team — this stops a Head Coach from
// pointing sourceLineup at another team's squad list. Returns true if
// sourceLineup is absent (optional) or valid for this team.
async function validSourceLineup(sourceLineup, team) {
  if (!sourceLineup) return true;
  const lineup = await Lineup.findById(sourceLineup);
  return !!lineup && lineup.team === team;
}

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
      "fullName khmerName dateOfBirth gender photoUrl team role verifyId _id isAvailable approvalStatus"
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

    const { name, shape, sourceLineup, positions } = req.body;
    if (!(await validSourceLineup(sourceLineup, team))) {
      return res.status(400).json({ message: "That squad list doesn't belong to this team" });
    }

    const formation = new Formation({
      createdBy: req.adminId,
      team,
      name,
      shape,
      sourceLineup: sourceLineup || null,
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

    const { name, shape, sourceLineup, positions } = req.body;
    if (sourceLineup !== undefined && !(await validSourceLineup(sourceLineup, formation.team))) {
      return res.status(400).json({ message: "That squad list doesn't belong to this team" });
    }

    if (name !== undefined) formation.name = name;
    if (shape !== undefined) formation.shape = shape;
    if (sourceLineup !== undefined) formation.sourceLineup = sourceLineup || null;
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

// ============ STARTING XI (MATCHDAY GRAPHIC) MANAGEMENT ============
// A simple card-grid "Starting XI" announcement — club vs opponent, starter
// cards, substitutes list — kept separate from the tactical Formation
// (pitch diagram) above. Same team-scoping rules apply.

router.post("/startingxi", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });

    const { name, opponent, competition, squadSize, sourceLineup, starters, substitutes } = req.body;
    if (!(await validSourceLineup(sourceLineup, team))) {
      return res.status(400).json({ message: "That squad list doesn't belong to this team" });
    }

    const startingXI = new StartingXI({
      createdBy: req.adminId,
      team,
      name,
      opponent,
      competition,
      squadSize: squadSize || 11,
      sourceLineup: sourceLineup || null,
      starters: starters || [],
      substitutes: substitutes || [],
    });

    await startingXI.save();
    await startingXI.populate("starters substitutes");

    res.status(201).json(startingXI);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/startingxis", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, team)) return res.status(403).json({ message: "Access denied" });

    const list = await StartingXI.find({ team })
      .populate("starters substitutes")
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/startingxi/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const startingXI = await StartingXI.findById(req.params.id).populate("starters substitutes");
    if (!startingXI) return res.status(404).json({ message: "Starting XI not found" });
    if (!canAccessTeam(req, startingXI.team)) return res.status(403).json({ message: "Access denied" });

    res.json(startingXI);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/startingxi/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const startingXI = await StartingXI.findById(req.params.id);
    if (!startingXI) return res.status(404).json({ message: "Starting XI not found" });
    if (!canAccessTeam(req, startingXI.team)) return res.status(403).json({ message: "Access denied" });

    const { name, opponent, competition, squadSize, sourceLineup, starters, substitutes } = req.body;
    if (sourceLineup !== undefined && !(await validSourceLineup(sourceLineup, startingXI.team))) {
      return res.status(400).json({ message: "That squad list doesn't belong to this team" });
    }

    if (name !== undefined) startingXI.name = name;
    if (opponent !== undefined) startingXI.opponent = opponent;
    if (competition !== undefined) startingXI.competition = competition;
    if (squadSize !== undefined) startingXI.squadSize = squadSize || 11;
    if (sourceLineup !== undefined) startingXI.sourceLineup = sourceLineup || null;
    if (starters !== undefined) startingXI.starters = starters;
    if (substitutes !== undefined) startingXI.substitutes = substitutes;

    await startingXI.save();
    await startingXI.populate("starters substitutes");

    res.json(startingXI);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/startingxi/:id", requireAuth, requireRole("HEAD_COACH", "ADMIN"), async (req, res) => {
  try {
    const startingXI = await StartingXI.findById(req.params.id);
    if (!startingXI) return res.status(404).json({ message: "Starting XI not found" });
    if (!canAccessTeam(req, startingXI.team)) return res.status(403).json({ message: "Access denied" });

    await StartingXI.findByIdAndDelete(req.params.id);
    res.json({ message: "Starting XI deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
