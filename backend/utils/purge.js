// Full, permanent deletion of an athlete or a whole team — the database
// rows in MongoDB Atlas AND their files on Cloudinary, so nothing is left
// pointing at a person/team that no longer exists. Used by
// DELETE /api/athletes/:id and DELETE /api/teams/:id (Admin only). Each
// has a matching preview*() that only COUNTS what would go, so the
// confirm dialog can show it first.
//
// Note: Render only runs the server; the data itself lives in MongoDB
// Atlas and the photos/files in Cloudinary — both are cleaned here.
const cloudinary = require("../config/cloudinary");
const Athlete = require("../models/Athlete");
const Admin = require("../models/Admin");
const Attendance = require("../models/Attendance");
const Formation = require("../models/Formation");
const Lineup = require("../models/Lineup");
const Payment = require("../models/Payment");
const RegistrationInvite = require("../models/RegistrationInvite");
const ScanLog = require("../models/ScanLog");
const StartingXI = require("../models/StartingXI");
const Team = require("../models/Team");
const Tournament = require("../models/Tournament");
const { FinanceSettings } = require("../models/Finance");

function destroyFiles(list) {
  const jobs = list
    .filter((f) => f && f.publicId)
    .map((f) => cloudinary.uploader.destroy(f.publicId, f.resourceType ? { resource_type: f.resourceType } : {}));
  return Promise.allSettled(jobs).then((results) => {
    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => console.warn("Cloudinary cleanup failed:", r.reason?.message));
    return { files: jobs.length, failed: failed.length };
  });
}

function athleteFiles(a) {
  return [
    { publicId: a.photoPublicId },
    { publicId: a.pendingPhotoPublicId },
    { publicId: a.qrCodePublicId },
    ...(a.supportingDocuments || []).map((d) => ({ publicId: d.publicId, resourceType: d.resourceType || "image" })),
  ].filter((f) => f.publicId);
}

// ---------- athlete ----------

async function previewAthlete(athlete) {
  const id = athlete._id;
  const [logins, attendance, payments, scans, tournaments, lineups, jerseyOrders] = await Promise.all([
    Admin.countDocuments({ athleteId: id }),
    Attendance.countDocuments({ athlete: id }),
    Payment.countDocuments({ athlete: id }),
    ScanLog.countDocuments({ athlete: id }),
    Tournament.countDocuments({ "registrations.athlete": id }),
    Lineup.countDocuments({ "athletes.athleteId": id }),
    Team.countDocuments({ "jerseyOrders.athlete": id }),
  ]);
  return {
    name: athlete.fullName,
    teams: [...new Set(athlete.assignments.map((a) => a.team))],
    logins,
    attendance,
    payments,
    scans,
    tournaments,
    lineups,
    jerseyOrders,
    files: athleteFiles(athlete).length,
  };
}

async function purgeAthlete(athlete) {
  const id = athlete._id;
  await Promise.all([
    Admin.deleteMany({ athleteId: id }),
    Attendance.deleteMany({ athlete: id }),
    Payment.deleteMany({ athlete: id }),
    ScanLog.deleteMany({ athlete: id }),
    Tournament.updateMany({ "registrations.athlete": id }, { $pull: { registrations: { athlete: id } } }),
    Lineup.updateMany({ "athletes.athleteId": id }, { $pull: { athletes: { athleteId: id } } }),
    Formation.updateMany({ "positions.athleteId": id }, { $pull: { positions: { athleteId: id } } }),
    StartingXI.updateMany({}, { $pull: { starters: id, substitutes: id } }),
    Team.updateMany({ "jerseyOrders.athlete": id }, { $pull: { jerseyOrders: { athlete: id } } }),
    RegistrationInvite.updateMany({ "registrations.athleteId": id }, { $pull: { registrations: { athleteId: id } } }),
    RegistrationInvite.updateMany({ athleteId: id }, { $set: { athleteId: null } }),
  ]);
  await Athlete.deleteOne({ _id: id });
  return destroyFiles(athleteFiles(athlete));
}

// ---------- team ----------

// Athletes on this team split into: only on this team (deleted entirely)
// vs also on other teams (kept, just lose this team's assignment).
async function teamAthletes(name) {
  const athletes = await Athlete.find({ "assignments.team": name });
  const onlyHere = athletes.filter((a) => a.assignments.every((x) => x.team === name));
  const alsoElsewhere = athletes.filter((a) => a.assignments.some((x) => x.team !== name));
  return { onlyHere, alsoElsewhere };
}

async function previewTeam(team) {
  const name = team.name;
  const { onlyHere, alsoElsewhere } = await teamAthletes(name);
  const [logins, attendance, payments, lineups, formations, startingXIs, invites, ownTournaments, otherTournaments] =
    await Promise.all([
      Admin.countDocuments({ team: name, athleteId: null }),
      Attendance.countDocuments({ team: name }),
      Payment.countDocuments({ team: name }),
      Lineup.countDocuments({ team: name }),
      Formation.countDocuments({ team: name }),
      StartingXI.countDocuments({ team: name }),
      RegistrationInvite.countDocuments({ team: name }),
      Tournament.countDocuments({ team: name }),
      Tournament.countDocuments({ team: { $ne: name }, $or: [{ "registrations.team": name }, { allowedTeams: name }] }),
    ]);
  return {
    name,
    athletesDeleted: onlyHere.length,
    athletesKept: alsoElsewhere.length,
    logins,
    attendance,
    payments,
    lineups,
    formations,
    startingXIs,
    invites,
    tournamentsDeleted: ownTournaments,
    tournamentsUpdated: otherTournaments,
    jerseyOrders: (team.jerseyOrders || []).length,
  };
}

async function purgeTeam(team) {
  const name = team.name;
  const { onlyHere, alsoElsewhere } = await teamAthletes(name);

  // 1. People only on this team → deleted completely (login, files, …).
  let files = 0;
  for (const a of onlyHere) {
    const r = await purgeAthlete(a);
    files += r.files;
  }

  // 2. People also on other teams → keep them, drop this team's assignment.
  for (const a of alsoElsewhere) {
    a.assignments = a.assignments.filter((x) => x.team !== name);
    await a.save();
    const nextTeam = a.assignments[0]?.team;
    await Admin.updateMany({ athleteId: a._id, team: name }, { $set: { team: nextTeam } });
  }

  // 3. Team logins (Head Coach / shared team login) and team-owned records.
  const ownTournaments = await Tournament.find({ team: name }).select("teamLineups");
  const tournamentLineupIds = ownTournaments.flatMap((t) => (t.teamLineups || []).map((e) => e.lineup));
  await Promise.all([
    Admin.deleteMany({ team: name, athleteId: null }),
    Attendance.deleteMany({ team: name }),
    Payment.deleteMany({ team: name }),
    Lineup.deleteMany({ $or: [{ team: name }, { _id: { $in: tournamentLineupIds } }] }),
    Formation.deleteMany({ team: name }),
    StartingXI.deleteMany({ team: name }),
    RegistrationInvite.deleteMany({ team: name }),
    Tournament.deleteMany({ team: name }),
    Tournament.updateMany(
      { team: { $ne: name } },
      { $pull: { registrations: { team: name }, allowedTeams: name, teamLineups: { team: name } } }
    ),
    FinanceSettings.updateMany({ receivableTeams: name }, { $pull: { receivableTeams: name } }),
  ]);

  // 4. The team itself + its logo / KHQR image.
  await Team.deleteOne({ _id: team._id });
  const own = await destroyFiles([{ publicId: team.logoPublicId }, { publicId: team.abaKhqrImagePublicId }]);
  return { athletesDeleted: onlyHere.length, athletesKept: alsoElsewhere.length, files: files + own.files };
}

module.exports = { previewAthlete, purgeAthlete, previewTeam, purgeTeam };
