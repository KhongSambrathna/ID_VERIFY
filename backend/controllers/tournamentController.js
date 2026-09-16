const Tournament = require("../models/Tournament");
const Athlete = require("../models/Athlete");
const Admin = require("../models/Admin");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

// A Head Coach may only ever touch a tournament scoped to their own team —
// never an open-to-everyone one (those are Admin-only), never another
// team's. Admin can touch anything.
function canManage(req, tournament) {
  if (req.adminRole === "ADMIN") return true;
  if (req.adminRole === "HEAD_COACH") return tournament.team && tournament.team === req.adminTeam;
  return false;
}

// `athleteId` — pass the CALLER's own athlete id (individual Player login
// only) to also include myRegistrationId, so the list view can show
// "Registered" without a separate detail fetch per tournament.
function summarize(t, athleteId) {
  const mine = athleteId ? t.registrations.find((r) => String(r.athlete) === String(athleteId)) : null;
  return {
    _id: t._id,
    name: t.name,
    description: t.description,
    entryFee: t.entryFee,
    matchDates: t.matchDates,
    team: t.team || "",
    ageLimitYear: t.ageLimitYear ?? null,
    overageSlots: t.overageSlots || 0,
    overageLimitYear: t.overageLimitYear ?? null,
    overageUsed: t.registrations.filter((r) => r.isOverage).length,
    maxParticipants: t.maxParticipants ?? null,
    registrationCount: t.registrations.length,
    myRegistrationId: mine ? mine._id : null,
    createdAt: t.createdAt,
  };
}

// Pulls the age-rule fields out of a create/update request body, with
// light validation — used by both createTournament and updateTournament.
// Throws a plain {status, message} on anything contradictory.
function parseAgeRuleFields(body) {
  const ageLimitYear = body.ageLimitYear !== undefined && body.ageLimitYear !== "" ? Number(body.ageLimitYear) : null;
  const overageSlots = body.overageSlots !== undefined && body.overageSlots !== "" ? Number(body.overageSlots) || 0 : 0;
  const overageLimitYear =
    body.overageLimitYear !== undefined && body.overageLimitYear !== "" ? Number(body.overageLimitYear) : null;
  const maxParticipants =
    body.maxParticipants !== undefined && body.maxParticipants !== "" ? Number(body.maxParticipants) : null;

  if ((overageSlots > 0 || overageLimitYear !== null) && !ageLimitYear) {
    throw { status: 400, message: "Set an age limit year before adding overage exceptions" };
  }
  if (ageLimitYear && overageLimitYear !== null && overageLimitYear > ageLimitYear) {
    throw { status: 400, message: "The overage birth year must be older (a smaller year) than the age limit year" };
  }
  return { ageLimitYear, overageSlots, overageLimitYear, maxParticipants };
}

// POST /api/tournaments  (Admin, Head Coach)
exports.createTournament = async (req, res) => {
  try {
    const { name, description, entryFee, matchDates, team } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const scopedTeam = isHeadCoach ? req.adminTeam : team || "";
    const ageRule = parseAgeRuleFields(req.body);

    const tournament = await Tournament.create({
      name: name.trim(),
      description: description || "",
      entryFee: Number(entryFee) || 0,
      matchDates: Array.isArray(matchDates) ? matchDates.filter(Boolean) : [],
      team: scopedTeam,
      ...ageRule,
      createdBy: req.adminId,
    });

    if (scopedTeam) {
      notifyTeamCoaches(scopedTeam, `🏆 New tournament "${tournament.name}" open for registration on ${scopedTeam}.`);
    } else {
      notifyAdmins(`🏆 New tournament "${tournament.name}" open for registration (all teams).`);
    }

    res.status(201).json(tournament);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// GET /api/tournaments — role-scoped list (summaries only, no per-player
// registration detail — that's GET /:id).
// - Admin: everything.
// - Head Coach / shared team Player login: their own team's tournaments,
//   plus every open-to-all tournament.
// - Individual Player login: same as above, scoped to their account's team.
exports.listTournaments = async (req, res) => {
  try {
    let filter = {};
    if (req.adminRole !== "ADMIN") {
      const team = req.adminTeam;
      filter = team ? { $or: [{ team: "" }, { team }] } : { team: "" };
    }
    const tournaments = await Tournament.find(filter).sort({ createdAt: -1 });
    res.json(tournaments.map((t) => summarize(t, req.adminRole === "PLAYER" ? req.athleteId : null)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/tournaments/:id — full detail including the registration list.
// A Player (shared or individual) can see who else has registered — same
// visibility as the rest of the roster/fee info they already get.
exports.getTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });

    if (req.adminRole !== "ADMIN" && tournament.team && tournament.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Tell the caller whether THEY (when they're an individual Player
    // account) are already registered, so the frontend can show
    // "Registered" instead of a register button without extra lookups.
    let myRegistrationId = null;
    if (req.adminRole === "PLAYER" && req.athleteId) {
      const mine = tournament.registrations.find((r) => String(r.athlete) === String(req.athleteId));
      if (mine) myRegistrationId = mine._id;
    }

    res.json({ ...tournament.toObject(), myRegistrationId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/tournaments/:id  (Admin, or Head Coach for their own team's tournament)
exports.updateTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    if (!canManage(req, tournament)) return res.status(403).json({ message: "Access denied" });

    const { name, description, entryFee, matchDates } = req.body;
    if (name !== undefined) tournament.name = name.trim();
    if (description !== undefined) tournament.description = description;
    if (entryFee !== undefined) tournament.entryFee = Number(entryFee) || 0;
    if (matchDates !== undefined) tournament.matchDates = Array.isArray(matchDates) ? matchDates.filter(Boolean) : [];
    // `team` is intentionally not editable after creation — changing it
    // could suddenly hide/expose an existing registration list to the
    // wrong team. Delete and recreate if the scope was genuinely wrong.

    if (
      req.body.ageLimitYear !== undefined ||
      req.body.overageSlots !== undefined ||
      req.body.overageLimitYear !== undefined ||
      req.body.maxParticipants !== undefined
    ) {
      const ageRule = parseAgeRuleFields({
        ageLimitYear: req.body.ageLimitYear ?? tournament.ageLimitYear,
        overageSlots: req.body.overageSlots ?? tournament.overageSlots,
        overageLimitYear: req.body.overageLimitYear ?? tournament.overageLimitYear,
        maxParticipants: req.body.maxParticipants ?? tournament.maxParticipants,
      });
      Object.assign(tournament, ageRule);
    }

    await tournament.save();
    res.json(tournament);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/tournaments/:id  (Admin, or Head Coach for their own team's tournament)
exports.deleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    if (!canManage(req, tournament)) return res.status(403).json({ message: "Access denied" });

    await tournament.deleteOne();
    res.json({ message: "Tournament deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Shared by self-register and register-on-behalf: finds the assignment to
// register under, checks the debt-on-that-team rule, and pushes the
// registration row. Throws a {status, message} plain object on any
// rejection so both routes can turn it into the right HTTP response.
async function buildRegistration(tournament, athleteId, requestedTeam) {
  const athlete = await Athlete.findById(athleteId);
  if (!athlete) throw { status: 404, message: "Athlete not found" };

  if (tournament.registrations.some((r) => String(r.athlete) === String(athlete._id))) {
    throw { status: 409, message: "Already registered for this tournament" };
  }

  if (tournament.maxParticipants && tournament.registrations.length >= tournament.maxParticipants) {
    throw { status: 403, message: `Tournament is full (${tournament.maxParticipants} spots taken)` };
  }

  const eligible = tournament.team
    ? athlete.assignments.filter((a) => a.team === tournament.team)
    : requestedTeam
    ? athlete.assignments.filter((a) => a.team === requestedTeam)
    : athlete.assignments;

  if (eligible.length === 0) {
    throw {
      status: 403,
      message: tournament.team
        ? `Not registered on ${tournament.team} — can't join this tournament`
        : "Choose which team you're registering under",
    };
  }
  if (eligible.length > 1) {
    throw { status: 400, message: "This person plays on more than one team — specify which team" };
  }

  const assignment = eligible[0];
  const feeOwed = (assignment.fees || []).reduce((sum, f) => sum + (f.amount || 0), 0);
  if (feeOwed > 0) {
    throw {
      status: 403,
      message: `Outstanding fee of $${feeOwed} on ${assignment.team} — settle it before registering for a tournament`,
    };
  }

  const isOverage = checkAgeRule(tournament, athlete);

  return {
    athlete: athlete._id,
    team: assignment.team,
    fullName: athlete.fullName,
    khmerName: athlete.khmerName,
    verifyId: athlete.verifyId,
    jerseyNumber: assignment.jerseyNumber ?? null,
    isOverage,
  };
}

// Returns whether this registration counts as an "overage" exception (see
// the Tournament model comment). Throws a {status, message} rejection when
// the athlete is too old outright, or when the overage exception is full.
function checkAgeRule(tournament, athlete) {
  if (!tournament.ageLimitYear) return false;

  if (!athlete.dateOfBirth) {
    throw {
      status: 403,
      message: "This tournament has an age limit but this person's date of birth isn't on file — add it first (Edit athlete)",
    };
  }
  const birthYear = new Date(athlete.dateOfBirth).getFullYear();
  if (birthYear >= tournament.ageLimitYear) return false; // within the normal age limit

  // Older than the normal cutoff — only allowed as a limited exception.
  if (tournament.overageLimitYear && birthYear < tournament.overageLimitYear) {
    throw {
      status: 403,
      message: `Born ${birthYear} — older than this tournament allows even as an exception (${tournament.overageLimitYear} or later)`,
    };
  }
  if (!tournament.overageSlots) {
    throw {
      status: 403,
      message: `Born ${birthYear} — older than the age limit (${tournament.ageLimitYear} or later) and no exceptions are allowed`,
    };
  }
  const overageUsed = tournament.registrations.filter((r) => r.isOverage).length;
  if (overageUsed >= tournament.overageSlots) {
    throw {
      status: 403,
      message: `Born ${birthYear} — the ${tournament.overageSlots} over-age exception spot(s) are already full`,
    };
  }
  return true;
}

// POST /api/tournaments/:id/register  (individual Player login only —
// self-registration; req.athleteId comes from that account's token)
exports.registerSelf = async (req, res) => {
  try {
    if (!req.athleteId) {
      return res.status(403).json({
        message: "This shared team login can't self-register — ask your Admin/Head Coach to register you, or use your own individual login.",
      });
    }
    // The frontend already forces a still-on-default-password account onto
    // the change-password screen before it can reach this page — this is
    // just the same rule enforced server-side too, in case that's bypassed.
    const account = await Admin.findById(req.adminId).select("mustChangePassword");
    if (account?.mustChangePassword) {
      return res.status(403).json({ message: "Set your own password before registering — sign in again to be prompted." });
    }
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    if (tournament.team && tournament.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    const row = await buildRegistration(tournament, req.athleteId, req.body.team);
    tournament.registrations.push(row);
    await tournament.save();

    notifyTeamCoaches(row.team, `📝 ${row.fullName} registered for "${tournament.name}" (${row.team}).`);

    res.status(201).json(tournament);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// POST /api/tournaments/:id/register-admin  (Admin, Head Coach) — body:
// { athleteId, team? } — for a player with no phone/login of their own.
// Same debt rule applies; the only difference from self-register is who's
// allowed to call it and which athlete id it acts on.
exports.registerOnBehalf = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    // Route already restricts this to ADMIN/HEAD_COACH — Admin can register
    // into anything; a Head Coach may register any of their own team's
    // athletes even into an open (not team-scoped) tournament, just never
    // into a DIFFERENT team's tournament.
    if (req.adminRole === "HEAD_COACH" && tournament.team && tournament.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { athleteId, team } = req.body;
    if (!athleteId) return res.status(400).json({ message: "athleteId is required" });

    if (req.adminRole === "HEAD_COACH") {
      const athlete = await Athlete.findById(athleteId);
      if (!athlete || !athlete.assignments.some((a) => a.team === req.adminTeam)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const row = await buildRegistration(tournament, athleteId, team);
    row.registeredBy = req.adminId;
    tournament.registrations.push(row);
    await tournament.save();

    res.status(201).json(tournament);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/tournaments/:id/registrations/:registrationId — the player
// themself (individual login, their own row only), or Admin/Head Coach
// (their own team's tournament).
exports.unregister = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });

    const row = tournament.registrations.id(req.params.registrationId);
    if (!row) return res.status(404).json({ message: "Registration not found" });

    const isOwnRow = req.adminRole === "PLAYER" && req.athleteId && String(row.athlete) === String(req.athleteId);
    // A Head Coach can also remove a registration under THEIR team even on
    // an open (not team-scoped) tournament — the same reach they already
    // have to register that player in via register-admin.
    const isOwnTeamsRegistration = req.adminRole === "HEAD_COACH" && row.team === req.adminTeam;
    if (!isOwnRow && !isOwnTeamsRegistration && !canManage(req, tournament)) {
      return res.status(403).json({ message: "Access denied" });
    }

    row.deleteOne();
    await tournament.save();
    res.json({ message: "Removed from tournament" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/tournaments/:id/export.csv  (Admin, or Head Coach for their own
// team's tournament) — the registered-player list, for handing out or
// keeping offline.
exports.exportRegistrationsCsv = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    if (!canManage(req, tournament)) return res.status(403).json({ message: "Access denied" });

    const escapeCsv = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Verify ID", "Full name", "Khmer name", "Team", "Jersey #", "Over-age", "Registered by"];
    const lines = [header.map(escapeCsv).join(",")];
    tournament.registrations.forEach((r) => {
      lines.push(
        [
          r.verifyId,
          r.fullName,
          r.khmerName || "",
          r.team,
          r.jerseyNumber ?? "",
          r.isOverage ? "Yes" : "",
          r.registeredBy ? "Admin/Coach" : "Self",
        ]
          .map(escapeCsv)
          .join(",")
      );
    });
    const csv = lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${tournament.name.replace(/[^a-z0-9]+/gi, "-")}-registrations.csv"`);
    res.send("﻿" + csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
