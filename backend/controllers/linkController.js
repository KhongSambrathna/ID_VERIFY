// App-link API — lets your other apps (Tournament, Shop) READ teams and
// their players from ID, so a team is typed in once (here) and reused there.
// Read-only, behind a per-app key (middleware/linkKey.js).
//
// Only what those apps need is shared: team name + logo, and for each
// APPROVED member: name (EN/KM), role, shirt number and the public verify ID
// (which links to the public /verify page). No date of birth, address,
// phone, photos, documents or fees ever leave this app.
//
// ទាញក្រុម និងកីឡាករពី ID ទៅកម្មវិធីផ្សេង (អានប៉ុណ្ណោះ)
const Team = require("../models/Team");
const Athlete = require("../models/Athlete");

const publicBase = () => (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROLE_ORDER = ["HEAD COACH", "ASSISTAN COACH", "TECHNICAL", "MEDIC", "PLAYER"];

// members of each team name → count (approved, not on the way out)
async function memberCounts(names) {
  const rows = await Athlete.aggregate([
    { $unwind: "$assignments" },
    {
      $match: {
        "assignments.team": { $in: names },
        "assignments.approvalStatus": "approved",
        "assignments.pendingRemoval": { $ne: true },
      },
    },
    {
      $group: {
        _id: "$assignments.team",
        players: { $sum: { $cond: [{ $eq: ["$assignments.role", "PLAYER"] }, 1, 0] } },
        staff: { $sum: { $cond: [{ $eq: ["$assignments.role", "PLAYER"] }, 0, 1] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
}

const teamOut = (t, counts) => ({
  id: String(t._id),
  name: t.name,
  nameKm: t.nameKm || "",
  tournamentClubId: t.tournamentClubId || null,
  logoUrl: t.logoUrl || null,
  players: counts?.get(t.name)?.players || 0,
  staff: counts?.get(t.name)?.staff || 0,
  updatedAt: t.updatedAt,
});

// GET /api/link/v1/teams?search=&limit=20   (limit up to 1000 → whole list)
exports.listTeams = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 1000);
    const q = String(req.query.search || "").trim();
    const filter = q ? { name: { $regex: escapeRe(q), $options: "i" } } : {};
    const teams = await Team.find(filter).select("name nameKm logoUrl tournamentClubId updatedAt").sort({ name: 1 }).limit(limit).lean();
    const counts = await memberCounts(teams.map((t) => t.name));
    res.json({ teams: teams.map((t) => teamOut(t, counts)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/link/v1/teams/:id  → team + approved members
exports.getTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).select("name logoUrl updatedAt").lean().catch(() => null);
    if (!team) return res.status(404).json({ message: "Team not found" });
    const athletes = await Athlete.find({
      assignments: {
        $elemMatch: { team: team.name, approvalStatus: "approved", pendingRemoval: { $ne: true } },
      },
    })
      .select("verifyId fullName khmerName assignments updatedAt")
      .lean();

    const base = publicBase();
    const members = [];
    for (const a of athletes) {
      for (const as of a.assignments || []) {
        if (as.team !== team.name || as.approvalStatus !== "approved" || as.pendingRemoval) continue;
        members.push({
          id: String(a._id),
          verifyId: a.verifyId || null,
          name: a.fullName,
          nameKm: a.khmerName || "",
          role: as.role || "PLAYER",
          number: Number.isInteger(as.jerseyNumber) ? as.jerseyNumber : null,
          verifyUrl: base && a.verifyId ? `${base}/verify/${encodeURIComponent(a.verifyId)}` : null,
        });
      }
    }
    members.sort(
      (x, y) =>
        ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role) ||
        (x.number ?? 999) - (y.number ?? 999) ||
        x.name.localeCompare(y.name)
    );
    const counts = await memberCounts([team.name]);
    res.json({ team: { ...teamOut(team, counts), members } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/link/v1/teams/push   (Tournament app only)
 * { teams: [{ ref, name, nameKm?, logoUrl?, mergeInto? }] }
 *   ref       = the Tournament club id (kept on the ID team as tournamentClubId)
 *   mergeInto = an ID team id to link to (when the names are spelled differently)
 * For each: linked already → keep; same name here → merge (link + fill a missing
 * logo / Khmer name); otherwise → create a new team. Players are then added in ID.
 * ទទួលក្រុមពី Tournament៖ ឈ្មោះដូចគ្នា → បញ្ចូលគ្នា, ថ្មី → បង្កើត
 */
exports.pushTeams = async (req, res) => {
  try {
    if (req.linkApp !== "tournament") return res.status(403).json({ message: "Only the Tournament app may send teams" });
    const list = Array.isArray(req.body?.teams) ? req.body.teams.slice(0, 500) : [];
    const results = [];
    for (const t of list) {
      const ref = String(t.ref || "").trim();
      const name = String(t.name || "").trim().slice(0, 100);
      const logoUrl = /^https:\/\//.test(t.logoUrl || "") ? t.logoUrl : null;
      const nameKm = String(t.nameKm || "").trim().slice(0, 100);
      if (!ref || !name) {
        results.push({ ref, error: "name and ref are required" });
        continue;
      }
      try {
        let team = null;
        let action = "merged";
        if (t.mergeInto) team = await Team.findById(t.mergeInto).catch(() => null);
        if (!team) team = await Team.findOne({ tournamentClubId: ref });
        if (team && team.tournamentClubId === ref && !t.mergeInto) action = "linked";
        if (!team) team = await Team.findOne({ name: new RegExp(`^${escapeRe(name)}$`, "i") });
        if (team && team.tournamentClubId && team.tournamentClubId !== ref) {
          results.push({ ref, error: `"${team.name}" is already linked to another Tournament team` });
          continue;
        }
        if (!team) {
          team = new Team({ name });
          action = "created";
        }
        team.tournamentClubId = ref;
        if (!team.logoUrl && logoUrl) team.logoUrl = logoUrl; // never replace a logo set in ID
        if (!team.nameKm && nameKm) team.nameKm = nameKm;
        await team.save();
        results.push({ ref, id: String(team._id), name: team.name, logoUrl: team.logoUrl || null, action });
      } catch (err) {
        results.push({ ref, error: err.code === 11000 ? `"${name}" already exists` : err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
