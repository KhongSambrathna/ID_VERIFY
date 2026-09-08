const Team = require("../models/Team");

// GET /api/teams  (admin only) — for the Team dropdowns (add athlete, assign coach)
exports.listTeams = async (req, res) => {
  try {
    const teams = await Team.find().sort({ name: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/teams  (admin only) — add a new team name, chosen from the dropdown afterwards
exports.createTeam = async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Team name is required" });

    const exists = await Team.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (exists) return res.status(409).json({ message: `"${exists.name}" already exists` });

    const team = await Team.create({ name });
    res.status(201).json(team);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "That team already exists" });
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/teams/:id  (admin only)
exports.deleteTeam = async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    if (!team) return res.status(404).json({ message: "Team not found" });
    res.json({ message: "Team deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
