const Attendance = require("../models/Attendance");
const Athlete = require("../models/Athlete");
const flattenAssignments = require("../utils/flattenAssignments");

const VALID_STATUSES = ["present", "absent", "late", "excused"];

// Team scoping mirrors coachRoutes exactly: an Admin manages any team (they
// pass req.body.team on create, req.query.team on list); a Head Coach is
// locked to their own team (req.adminTeam). Once a session belongs to a team,
// anyone with access to that team can see/edit/delete it — attendance is a
// shared team resource, not personal to whoever recorded it.
function resolveTeam(req) {
  return req.adminRole === "ADMIN" ? (req.body.team || req.query.team || "").trim() : req.adminTeam;
}

function canAccessTeam(req, team) {
  return req.adminRole === "ADMIN" || team === req.adminTeam;
}

// Counts how many records fall into each status bucket, plus the total. Used
// by both the list view (a compact summary per session without loading every
// record) and the per-athlete summary endpoint.
function statusCounts(records) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
  for (const r of records || []) {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
    counts.total += 1;
  }
  return counts;
}

// The list view shape — session metadata + a status breakdown, WITHOUT the
// full per-athlete records[] (those are only fetched when a specific session
// is opened). Keeps the list payload small as history grows.
function summarize(session) {
  return {
    _id: session._id,
    team: session.team,
    type: session.type,
    date: session.date,
    title: session.title,
    notes: session.notes,
    counts: statusCounts(session.records),
    recordedBy: session.recordedBy || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

// Sanitizes and normalizes the incoming records[] from the request body.
// Each record must reference an athlete that is ACTUALLY on this team (via a
// matching assignment), otherwise it's dropped — this stops a caller from
// recording attendance for someone on another team. The athlete snapshot
// fields (fullName/jerseyNumber/role) are taken from the live Athlete doc at
// save time, never trusted from the client. Deduped by athlete id (last one
// wins) so a person with two roles on this team isn't recorded twice.
async function buildRecords(rawRecords, team) {
  if (!Array.isArray(rawRecords)) return [];

  // Look up every referenced athlete once (those with an assignment on this
  // team only), keyed by id for the loop below.
  const ids = [...new Set(rawRecords.map((r) => r && r.athlete).filter(Boolean))];
  if (ids.length === 0) return [];
  const athletes = await Athlete.find({ _id: { $in: ids }, "assignments.team": team });

  const byId = new Map();
  for (const athlete of athletes) {
    // A person can hold several roles on this team — flattenAssignments gives
    // one row per assignment; grab the first for this team as the snapshot.
    const rows = flattenAssignments(athlete, team);
    const row = rows[0];
    if (!row) continue;
    byId.set(String(athlete._id), {
      fullName: athlete.fullName || "",
      jerseyNumber: row.jerseyNumber ?? null,
      role: row.role || "PLAYER",
    });
  }

  // One record per athlete, deduped by id. A Map preserves first-seen order
  // while letting a later duplicate overwrite the value in place (so the
  // person keeps their original position but the LAST status/note wins).
  const map = new Map();
  for (const r of rawRecords) {
    if (!r || !r.athlete) continue;
    const key = String(r.athlete);
    const snapshot = byId.get(key);
    if (!snapshot) continue; // athlete not on this team (or doesn't exist) — skip
    map.set(key, {
      athlete: r.athlete,
      ...snapshot,
      status: VALID_STATUSES.includes(r.status) ? r.status : "present",
      note: typeof r.note === "string" ? r.note.trim() : "",
    });
  }
  return [...map.values()];
}

// GET /api/attendance/summary?team=X
// Per-athlete attendance stats across ALL of a team's sessions — how many
// times each person was present/absent/late/excused and an attendance rate
// (present+late counts as attended; excused/absent doesn't). Ordered by
// attendance rate ascending so the coach sees who's been missing the most at
// the top. This is the "who's actually showing up" report.
async function attendanceSummary(req, res) {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, team)) return res.status(403).json({ message: "Access denied" });

    const sessions = await Attendance.find({ team }).select("records");

    const byAthlete = new Map();
    for (const session of sessions) {
      for (const rec of session.records || []) {
        const key = String(rec.athlete);
        if (!byAthlete.has(key)) {
          byAthlete.set(key, {
            athlete: rec.athlete,
            fullName: rec.fullName,
            jerseyNumber: rec.jerseyNumber ?? null,
            role: rec.role || "PLAYER",
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            total: 0,
          });
        }
        const agg = byAthlete.get(key);
        agg.total += 1;
        if (agg[rec.status] !== undefined) agg[rec.status] += 1;
      }
    }

    const rows = [...byAthlete.values()].map((agg) => {
      const attended = agg.present + agg.late;
      const rate = agg.total ? Math.round((attended / agg.total) * 100) : 0;
      return { ...agg, attended, rate };
    });
    rows.sort((a, b) => a.rate - b.rate || a.fullName.localeCompare(b.fullName));

    res.json({ team, sessionCount: sessions.length, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/attendance?team=X — list of sessions (summary shape, newest first).
async function listAttendance(req, res) {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, team)) return res.status(403).json({ message: "Access denied" });

    const sessions = await Attendance.find({ team }).sort({ date: -1, createdAt: -1 });
    res.json(sessions.map(summarize));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/attendance/:id — one session WITH its full per-athlete records.
async function getAttendance(req, res) {
  try {
    const session = await Attendance.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Attendance session not found" });
    if (!canAccessTeam(req, session.team)) return res.status(403).json({ message: "Access denied" });

    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/attendance — create a session.
async function createAttendance(req, res) {
  try {
    const team = resolveTeam(req);
    if (!team) return res.status(400).json({ message: "Team is required" });

    const { type, date, title, notes, records } = req.body;
    if (!date) return res.status(400).json({ message: "Date is required" });

    const session = new Attendance({
      team,
      type: type === "match" ? "match" : "training",
      date: new Date(date),
      title: (title || "").trim(),
      notes: (notes || "").trim(),
      records: await buildRecords(records, team),
      recordedBy: req.adminId,
    });

    await session.save();
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/attendance/:id — update a session (any field, records optional).
async function updateAttendance(req, res) {
  try {
    const session = await Attendance.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Attendance session not found" });
    if (!canAccessTeam(req, session.team)) return res.status(403).json({ message: "Access denied" });

    const { type, date, title, notes, records } = req.body;
    if (type !== undefined) session.type = type === "match" ? "match" : "training";
    if (date !== undefined) {
      if (!date) return res.status(400).json({ message: "Date is required" });
      session.date = new Date(date);
    }
    if (title !== undefined) session.title = (title || "").trim();
    if (notes !== undefined) session.notes = (notes || "").trim();
    if (records !== undefined) session.records = await buildRecords(records, session.team);

    await session.save();
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// DELETE /api/attendance/:id — remove a session.
async function deleteAttendance(req, res) {
  try {
    const session = await Attendance.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Attendance session not found" });
    if (!canAccessTeam(req, session.team)) return res.status(403).json({ message: "Access denied" });

    await Attendance.findByIdAndDelete(req.params.id);
    res.json({ message: "Attendance session deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  listAttendance,
  attendanceSummary,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
};

