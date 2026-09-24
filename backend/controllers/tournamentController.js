const Tournament = require("../models/Tournament");
const Athlete = require("../models/Athlete");
const Admin = require("../models/Admin");
const Lineup = require("../models/Lineup");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

// Finds (or creates) the auto-managed Lineup — the same "Squad list" the My
// Team > Squad list tab manages — for one team's registrations in this
// tournament. Mutates tournament.teamLineups in memory when a new one is
// created; the caller is responsible for tournament.save() afterwards (it's
// saved together with whatever else that call is already saving).
async function ensureTournamentLineup(tournament, team) {
  const entry = tournament.teamLineups.find((e) => e.team === team);
  if (entry) {
    const existing = await Lineup.findById(entry.lineup);
    if (existing) return existing;
    // Lineup was deleted separately (from the Squad list tab) — fall
    // through and recreate one, then repoint this entry at it.
  }

  const lineup = await Lineup.create({
    coachId: tournament.createdBy,
    team,
    name: `${tournament.name} — Tournament squad`,
    athletes: [],
    notes: `Auto-managed — kept in sync with registrations for the "${tournament.name}" tournament.`,
  });

  if (entry) {
    entry.lineup = lineup._id;
  } else {
    tournament.teamLineups.push({ team, lineup: lineup._id });
  }
  return lineup;
}

async function addAthleteToLineup(lineup, athleteId) {
  const already = lineup.athletes.some((a) => String(a.athleteId) === String(athleteId));
  if (!already) {
    lineup.athletes.push({ athleteId });
    await lineup.save();
  }
}

async function removeAthleteFromLineup(lineup, athleteId) {
  const before = lineup.athletes.length;
  lineup.athletes = lineup.athletes.filter((a) => String(a.athleteId) !== String(athleteId));
  if (lineup.athletes.length !== before) await lineup.save();
}

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
    registrationClosed: !!t.registrationClosed,
    // PLAYER-only count — matches what maxParticipants actually caps (see
    // playerRegistrationCount); staff (Head Coach/Assistant Coach/Medic/
    // Technical) registrations don't count toward the cap, so they're left
    // out of this number too, or the "x/max" spots column would look full
    // when it isn't.
    registrationCount: playerRegistrationCount(t),
    unpaidCount:
      t.entryFee > 0
        ? t.registrations.filter((r) => !r.convertedToDebt && (r.feePaidAmount || 0) < t.entryFee).length
        : 0,
    debtSettledAt: t.debtSettledAt || null,
    myRegistrationId: mine ? mine._id : null,
    // Whether MY OWN withdrawal request (if any) is still waiting on
    // Admin/Head Coach confirmation — see registrationSchema.pendingRemoval.
    // Lets the tournament list show "Withdrawal requested" instead of a
    // Cancel button, without a separate detail fetch.
    myRegistrationPendingRemoval: mine ? !!mine.pendingRemoval : false,
    createdAt: t.createdAt,
  };
}

// "<Tournament name> (<match date(s)>)" — or just the name when no match
// date is set — used as the owed-fee note so a debt that came from a
// tournament is identifiable at a glance in the Debt report/CSV/athlete
// fee list, same as any other fee note there.
function tournamentFeeNote(tournament) {
  const dates = (tournament.matchDates || [])
    .map((d) => {
      const date = new Date(d);
      return isNaN(date) ? null : date.toISOString().slice(0, 10);
    })
    .filter(Boolean);
  return `Tournament fee — ${tournament.name}${dates.length ? ` (${dates.join(", ")})` : ""}`;
}

// A tournament counts as "ended" once a full day has passed since its last
// match date — the buffer just avoids settling mid-day, before the last
// game has actually been played. Tournaments with no dates set never
// auto-settle; use the explicit "settle now" action for those instead.
function hasTournamentEnded(tournament) {
  if (!tournament.matchDates || tournament.matchDates.length === 0) return false;
  const last = tournament.matchDates.reduce((max, d) => (d > max ? d : max), tournament.matchDates[0]);
  const cutoff = new Date(last).getTime() + 24 * 60 * 60 * 1000;
  return Date.now() > cutoff;
}

// Rolls each still-unpaid (or partially-paid) registration's REMAINING
// entry fee into the athlete's normal owed-fee list (the same `fees[]` the
// Debt report/cash-payment/ABA flow already reads and writes) — a plain,
// one-off fee row, functionally identical to an admin adding it by hand
// via "Edit athlete". Runs at most once per tournament (`debtSettledAt`
// guards it), and only once it has actually ended, unless `force` is
// passed (the explicit "settle now" action, for a tournament with no match
// dates set, or to close it early). Never throws — a lookup failure for
// one registration just skips that row, so one bad record can't block the
// rest of the list from being read.
async function settleUnpaidToDebt(tournament, { force = false } = {}) {
  if (tournament.debtSettledAt) return false;
  if (!tournament.entryFee || tournament.entryFee <= 0) return false;
  if (!force && !hasTournamentEnded(tournament)) return false;

  const unpaid = tournament.registrations.filter(
    (r) => !r.convertedToDebt && (r.feePaidAmount || 0) < tournament.entryFee
  );
  for (const r of unpaid) {
    try {
      const remaining = tournament.entryFee - (r.feePaidAmount || 0);
      const athlete = await Athlete.findById(r.athlete);
      if (!athlete) continue;
      const assignment = athlete.assignments.find((a) => a.team === r.team);
      if (!assignment) continue;
      assignment.fees.push({ amount: remaining, note: tournamentFeeNote(tournament) });
      await athlete.save();
      r.convertedToDebt = true;
    } catch {
      // Skip this row; it stays eligible to retry next time settlement runs.
    }
  }
  tournament.debtSettledAt = new Date();
  await tournament.save();
  return true;
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
// - Referee: everything too — a team-less, read-only account meant to see
//   the whole league's match schedule, not just one team's.
// - Head Coach / shared team Player login: their own team's tournaments,
//   plus every open-to-all tournament.
// - Individual Player login: same as above, scoped to their account's team.
exports.listTournaments = async (req, res) => {
  try {
    let filter = {};
    if (req.adminRole !== "ADMIN" && req.adminRole !== "REFEREE") {
      const team = req.adminTeam;
      filter = team ? { $or: [{ team: "" }, { team }] } : { team: "" };
    }
    const tournaments = await Tournament.find(filter).sort({ createdAt: -1 });

    // Best-effort auto-settle on the way past — only Admin/Head Coach
    // trigger it (a Player's or Referee's own list view shouldn't be the
    // thing that mutates other athletes' debt), and one tournament's error
    // never blocks the rest.
    if (req.adminRole === "ADMIN" || req.adminRole === "HEAD_COACH") {
      for (const t of tournaments) {
        try {
          await settleUnpaidToDebt(t);
        } catch {
          // Leave it unsettled; the next list/detail load retries.
        }
      }
    }

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

    // Self-healing backfill: dateOfBirth/photoUrl were added to the
    // registration snapshot after some registrations already existed, so
    // those older rows are missing them even though the athlete record
    // itself has the data. Pull it in from the athlete once and persist it,
    // so this only ever runs a single time per old registration.
    const missing = tournament.registrations.filter((r) => r.dateOfBirth == null || r.photoUrl == null);
    if (missing.length > 0) {
      const athletes = await Athlete.find({ _id: { $in: missing.map((r) => r.athlete) } }).select(
        "dateOfBirth photoUrl"
      );
      const byId = new Map(athletes.map((a) => [String(a._id), a]));
      let changed = false;
      missing.forEach((r) => {
        const a = byId.get(String(r.athlete));
        if (!a) return;
        if (r.dateOfBirth == null && a.dateOfBirth) {
          r.dateOfBirth = a.dateOfBirth;
          changed = true;
        }
        if (r.photoUrl == null && a.photoUrl) {
          r.photoUrl = a.photoUrl;
          changed = true;
        }
      });
      if (changed) await tournament.save();
    }

    // Same reasoning as listTournaments — staff-only, best-effort.
    if (req.adminRole !== "PLAYER") {
      try {
        await settleUnpaidToDebt(tournament);
      } catch {
        // Leave it unsettled; the next list/detail load retries.
      }
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

// Registrations under any assignment role other than PLAYER (Head Coach,
// Assistant Coach, Medic, Technical) are staff tagging along, not players
// competing for a roster spot — they never count against maxParticipants
// and never trigger the age-limit/overage rule. Same convention as
// checkPlayerCap in athleteController.js for the per-team roster cap.
function isStaffRole(role) {
  return !!role && role !== "PLAYER";
}

// How many PLAYER-role registrations count against maxParticipants — used
// both for the cap check here and for the "spots" count shown in the list
// (see summarize) so the two always agree.
function playerRegistrationCount(tournament) {
  return tournament.registrations.filter((r) => !isStaffRole(r.role)).length;
}

// Shared by self-register and register-on-behalf: finds the assignment to
// register under, checks the debt-on-that-team rule, and pushes the
// registration row. Throws a {status, message} plain object on any
// rejection so both routes can turn it into the right HTTP response.
// `allowDebt` skips the debt-on-that-team rule — set by register-on-behalf
// only, so an Admin/Head Coach can still register someone who owes a fee,
// even though that same player is blocked from registering themselves.
async function buildRegistration(tournament, athleteId, requestedTeam, { allowDebt = false } = {}) {
  const athlete = await Athlete.findById(athleteId);
  if (!athlete) throw { status: 404, message: "Athlete not found" };

  if (tournament.registrations.some((r) => String(r.athlete) === String(athlete._id))) {
    throw { status: 409, message: "Already registered for this tournament" };
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
  const role = assignment.role || "PLAYER";
  const staff = isStaffRole(role);

  // Cap and age rule only ever apply to PLAYER registrations — a coach or
  // medic registering alongside the squad skips both.
  if (!staff && tournament.maxParticipants && playerRegistrationCount(tournament) >= tournament.maxParticipants) {
    throw { status: 403, message: `Tournament is full (${tournament.maxParticipants} spots taken)` };
  }

  const feeOwed = (assignment.fees || []).reduce((sum, f) => sum + (f.amount || 0), 0);
  if (feeOwed > 0 && !allowDebt) {
    throw {
      status: 403,
      message: `Outstanding fee of $${feeOwed} on ${assignment.team} — settle it before registering for a tournament`,
    };
  }

  const isOverage = staff ? false : checkAgeRule(tournament, athlete);

  return {
    athlete: athlete._id,
    team: assignment.team,
    role,
    fullName: athlete.fullName,
    khmerName: athlete.khmerName,
    verifyId: athlete.verifyId,
    photoUrl: athlete.photoUrl || null,
    dateOfBirth: athlete.dateOfBirth || null,
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
    if (tournament.registrationClosed) {
      return res.status(403).json({ message: "Registration is closed for this tournament." });
    }

    const row = await buildRegistration(tournament, req.athleteId, req.body.team);
    tournament.registrations.push(row);
    const lineup = await ensureTournamentLineup(tournament, row.team);
    await tournament.save();
    await addAthleteToLineup(lineup, row.athlete);

    notifyTeamCoaches(row.team, `📝 ${row.fullName} registered for "${tournament.name}" (${row.team}).`);

    res.status(201).json(tournament);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// POST /api/tournaments/:id/register-admin  (Admin, Head Coach) — body:
// { athleteId, team? } — for a player with no phone/login of their own, or
// for staff registering a player on their behalf. Unlike self-register,
// this skips the debt-on-that-team block — an Admin/Head Coach can still
// choose to register someone who owes a fee, even though that same player
// can't register themselves while they owe it.
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

    const row = await buildRegistration(tournament, athleteId, team, { allowDebt: true });
    row.registeredBy = req.adminId;
    tournament.registrations.push(row);
    const lineup = await ensureTournamentLineup(tournament, row.team);
    await tournament.save();
    await addAthleteToLineup(lineup, row.athlete);

    res.status(201).json(tournament);
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/tournaments/:id/registrations/:registrationId — Admin/Head
// Coach (their own team's tournament) removes anyone immediately, same as
// always. A PLAYER hitting this on their OWN row is different: it doesn't
// remove them outright, it just flags the row pendingRemoval and leaves
// them fully registered — actually taking them off the roster needs an
// Admin/Head Coach to call this same endpoint themselves (confirming it),
// or PATCH .../keep to decline it and clear the flag instead (see
// keepRegistration below).
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
    const isStaff = isOwnTeamsRegistration || canManage(req, tournament);
    if (!isOwnRow && !isStaff) {
      return res.status(403).json({ message: "Access denied" });
    }
    // Staff can still remove (or confirm the removal of) anyone at any
    // time — this only blocks a PLAYER requesting their own withdrawal once
    // registration has been closed.
    if (isOwnRow && !isStaff && tournament.registrationClosed) {
      return res.status(403).json({
        message: "Registration is closed for this tournament — ask your Admin/Head Coach to remove you.",
      });
    }

    if (isOwnRow && !isStaff) {
      if (row.pendingRemoval) return res.json(tournament); // already requested — no-op
      row.pendingRemoval = true;
      await tournament.save();
      const text = `🚪 ${row.fullName} asked to withdraw from "${tournament.name}" (${row.team}) — needs Admin/Head Coach confirmation.`;
      notifyAdmins(text);
      notifyTeamCoaches(row.team, text);
      return res.json(tournament);
    }

    const removedAthleteId = row.athlete;
    const removedTeam = row.team;
    row.deleteOne();
    await tournament.save();

    // Keep the auto-managed Squad list in sync — drop them from it too, so
    // they don't linger in the Formation/Starting XI player pool.
    const entry = tournament.teamLineups.find((e) => e.team === removedTeam);
    if (entry) {
      const lineup = await Lineup.findById(entry.lineup);
      if (lineup) await removeAthleteFromLineup(lineup, removedAthleteId);
    }

    res.json({ message: "Removed from tournament" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/tournaments/:id/registrations/:registrationId/keep  (Admin, or
// Head Coach for their own team) — declines a player's own pending
// withdrawal request: clears pendingRemoval and leaves the registration
// exactly as it was, same "keep" idea as an assignment removal request's
// decline path in athleteController.js.
exports.keepRegistration = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });

    const row = tournament.registrations.id(req.params.registrationId);
    if (!row) return res.status(404).json({ message: "Registration not found" });

    const isOwnTeamsRegistration = req.adminRole === "HEAD_COACH" && row.team === req.adminTeam;
    if (!isOwnTeamsRegistration && !canManage(req, tournament)) {
      return res.status(403).json({ message: "Access denied" });
    }

    row.pendingRemoval = false;
    await tournament.save();
    notifyTeamCoaches(row.team, `↩️ ${row.fullName}'s withdrawal request from "${tournament.name}" was declined — they stay registered.`);
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/tournaments/:id/registrations/:registrationId/paid  (Admin, or
// Head Coach for their own team's registrations) — body: { amount }. Sets
// the cash amount collected so far for this registration's entry fee (can
// be less than the tournament's entryFee for a partial payment, e.g. paid
// in installments). Just a note in the list, not a payment record of its
// own. Locked once the row has already been converted to regular debt;
// collect the rest through the Debt report instead, same as any other
// owed fee.
exports.setRegistrationPaid = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });

    const row = tournament.registrations.id(req.params.registrationId);
    if (!row) return res.status(404).json({ message: "Registration not found" });

    const isOwnTeamsRegistration = req.adminRole === "HEAD_COACH" && row.team === req.adminTeam;
    if (!isOwnTeamsRegistration && !canManage(req, tournament)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (row.convertedToDebt) {
      return res.status(409).json({
        message: "This has already been converted to regular debt — record the payment from the Debt report instead.",
      });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    if (amount > tournament.entryFee) {
      return res.status(400).json({ message: `Amount can't exceed the entry fee ($${tournament.entryFee})` });
    }

    row.feePaidAmount = amount;
    row.feePaid = amount >= tournament.entryFee && tournament.entryFee > 0;
    row.feePaidAt = amount > 0 ? new Date() : null;
    row.feePaidBy = amount > 0 ? req.adminId : null;

    await tournament.save();
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/tournaments/:id/settle-debts  (Admin, or Head Coach for their
// own team's tournament) — forces the unpaid → debt conversion right now,
// regardless of match dates (for a tournament with no dates set, or to
// close it out early). No-op (still returns 200) if already settled.
exports.settleTournamentNow = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    if (!canManage(req, tournament)) return res.status(403).json({ message: "Access denied" });

    await settleUnpaidToDebt(tournament, { force: true });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/tournaments/:id/registration-status  (Admin, or Head Coach for
// their own team's tournament) — body: { closed: boolean }. Stops (or
// re-allows) players registering/cancelling themselves; staff can always
// register-on-behalf or remove anyone regardless of this setting.
exports.setRegistrationClosed = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    if (!canManage(req, tournament)) return res.status(403).json({ message: "Access denied" });

    tournament.registrationClosed = !!req.body.closed;
    await tournament.save();
    res.json(tournament);
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
    const header = ["Verify ID", "Full name", "Khmer name", "Team", "Role", "Jersey #", "Over-age", "Registered by", "Fee paid"];
    const lines = [header.map(escapeCsv).join(",")];
    tournament.registrations.forEach((r) => {
      lines.push(
        [
          r.verifyId,
          r.fullName,
          r.khmerName || "",
          r.team,
          r.role && r.role !== "PLAYER" ? r.role : "Player",
          r.jerseyNumber ?? "",
          r.isOverage ? "Yes" : "",
          r.registeredBy ? "Admin/Coach" : "Self",
          tournament.entryFee > 0
            ? r.convertedToDebt
              ? "Converted to debt"
              : `$${r.feePaidAmount || 0} of $${tournament.entryFee}`
            : "",
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
