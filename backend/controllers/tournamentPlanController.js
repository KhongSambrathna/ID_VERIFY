const mongoose = require("mongoose");
const TournamentPlan = require("../models/TournamentPlan");

const TZ = "+07:00";
const GENDERS = ["male", "female", "mixed"];
const STATUSES = ["planned", "confirmed", "done", "cancelled"];

// "2026-12-05" → that day at local noon.
function day(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}/.test(String(str))) return null;
  const d = new Date(`${String(str).slice(0, 10)}T12:00:00${TZ}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function apply(plan, b) {
  const text = (k) => {
    if (b[k] !== undefined) plan[k] = String(b[k] || "").trim();
  };
  ["title", "trophy", "kit", "ageGroup", "location", "teams", "note"].forEach(text);
  if (b.gender !== undefined) {
    if (!GENDERS.includes(b.gender)) return "Choose men, women or mixed";
    plan.gender = b.gender;
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return "Invalid status";
    plan.status = b.status;
  }
  if (b.teamsCount !== undefined) {
    if (b.teamsCount === "" || b.teamsCount === null) plan.teamsCount = null;
    else {
      const n = Number(b.teamsCount);
      if (!Number.isInteger(n) || n < 0) return "Enter a valid number of teams";
      plan.teamsCount = n;
    }
  }
  if (b.playDays !== undefined) {
    if (!Array.isArray(b.playDays)) return "Invalid play days";
    const days = [];
    for (const [i, d] of b.playDays.entries()) {
      const date = day(d.date);
      if (!date) return `Play day ${i + 1}: choose a date`;
      days.push({ date, time: String(d.time || "").trim(), note: String(d.note || "").trim() });
    }
    days.sort((a, c) => a.date - c.date);
    plan.playDays = days;
  }
  if (!plan.title) return "Enter the trophy / tournament name";
  return null;
}

// GET /api/tournament-plans?status=&gender=&ageGroup=
// Sorted by first play day (plans without days last).
exports.list = async (req, res) => {
  try {
    const filter = {};
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (GENDERS.includes(req.query.gender)) filter.gender = req.query.gender;
    if (req.query.ageGroup) filter.ageGroup = String(req.query.ageGroup);
    const rows = await TournamentPlan.find(filter).lean();
    const first = (p) => (p.playDays && p.playDays.length ? new Date(p.playDays[0].date).getTime() : Infinity);
    rows.sort((a, b) => first(a) - first(b) || String(a.title).localeCompare(String(b.title)));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const plan = new TournamentPlan({ createdBy: req.adminId });
    const err = apply(plan, req.body || {});
    if (err) return res.status(400).json({ message: err });
    await plan.save();
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Plan not found" });
    const plan = await TournamentPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    const err = apply(plan, req.body || {});
    if (err) return res.status(400).json({ message: err });
    await plan.save();
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Plan not found" });
    const plan = await TournamentPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
