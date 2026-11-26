const Team = require("../models/Team");
const Athlete = require("../models/Athlete");
const Attendance = require("../models/Attendance");
const TrainingPayment = require("../models/TrainingPayment");
const flattenAssignments = require("../utils/flattenAssignments");

// ថ្លៃហ្វឹកហាត់ — training fees, everything in riel.
//
// How the money works (one "wallet" per student per team):
//   balance = everything they paid − every training session they attended
// A session costs its own feePerSession (the team's price when it was saved);
// only "present" and "late" are charged — absent/excused cost nothing.
//
//   Monthly plan, ៛10,000 = 4 × ៛2,500:
//     came 4 times → balance 0      → next month pays ៛10,000
//     came 3 times → balance ៛2,500 → next month pays only ៛7,500
//     came 5 times → balance −៛2,500 → next month pays ៛12,500
//   Weekly / daily: pay ៛2,500 per session; a negative balance = owes.
//
// Nothing is stored as a "debt" — it is always worked out from payments +
// attendance, so fixing a wrong attendance tick fixes the money too.

const PLANS = ["day", "week", "month"];
const CHARGED = new Set(["present", "late"]);

// Same team scoping as attendanceController: an Admin picks any team; a Head
// Coach (or Admin in coach mode) is locked to their own team.
function resolveTeam(req) {
  return req.adminRole === "ADMIN" ? String(req.body.team || req.query.team || "").trim() : req.adminTeam;
}
function canAccessTeam(req, team) {
  return req.adminRole === "ADMIN" || team === req.adminTeam;
}

// Only the Admin (also while in coach mode) switches the feature on/off.
const canToggle = (req) => req.adminRole === "ADMIN" || !!req.isAdminCoachMode;

function settingsOf(team) {
  const f = team?.trainingFee || {};
  return {
    enabled: !!f.enabled,
    pricePerSession: Math.max(0, Number(f.pricePerSession ?? 2500) || 0),
    monthlyFee: Math.max(0, Number(f.monthlyFee ?? 10000) || 0),
    sessionsPerWeek: Math.max(1, Number(f.sessionsPerWeek ?? 1) || 1),
  };
}

const wholeRiel = (v) => Math.round(Number(v) || 0);

// "2026-11" → [start, end) of that month in Cambodia time (UTC+7), so a
// session on the 1st at 7am local isn't counted in the previous month.
function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, mo, 1) - 7 * 3600 * 1000);
  const end = new Date(Date.UTC(y, mo + 1, 1) - 7 * 3600 * 1000);
  return { start, end, key: `${y}-${String(mo + 1).padStart(2, "0")}` };
}

// GET /api/training-fees/settings?team=X
async function getSettings(req, res) {
  try {
    const name = resolveTeam(req);
    if (!name) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, name)) return res.status(403).json({ message: "Access denied" });
    const team = await Team.findOne({ name }).select("name trainingFee").lean();
    if (!team) return res.status(404).json({ message: "Team not found" });
    res.json({ team: name, ...settingsOf(team), canToggle: canToggle(req) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// PUT /api/training-fees/settings — switching the feature on/off is the
// Admin's call (also from coach mode); a real Head Coach can only change
// prices once the Admin has switched it on.
async function updateSettings(req, res) {
  try {
    const name = resolveTeam(req);
    if (!name) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, name)) return res.status(403).json({ message: "Access denied" });
    const team = await Team.findOne({ name });
    if (!team) return res.status(404).json({ message: "Team not found" });

    const isAdmin = canToggle(req);
    const current = settingsOf(team);
    if (!isAdmin && !current.enabled) {
      return res.status(403).json({ message: "Admin មិនទាន់បើកមុខងារហ្វឹកហាត់សម្រាប់ក្រុមនេះទេ" });
    }

    const b = req.body || {};
    const next = { ...current };
    if (typeof b.enabled === "boolean") {
      if (!isAdmin) return res.status(403).json({ message: "មានតែ Admin ទេដែលអាចបើក/បិទមុខងារនេះ" });
      next.enabled = b.enabled;
    }
    for (const k of ["pricePerSession", "monthlyFee"]) {
      if (b[k] !== undefined) {
        const v = wholeRiel(b[k]);
        if (v < 0) return res.status(400).json({ message: "Price can't be negative" });
        next[k] = v;
      }
    }
    if (b.sessionsPerWeek !== undefined) next.sessionsPerWeek = Math.min(7, Math.max(1, wholeRiel(b.sessionsPerWeek)));

    team.trainingFee = next;
    await team.save();
    res.json({ team: name, ...settingsOf(team), canToggle: isAdmin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/training-fees/summary?team=X&month=YYYY-MM
// One row per student on the team: this month's attendance + payments, the
// all-time balance, and how much they should pay now.
async function summary(req, res) {
  try {
    const name = resolveTeam(req);
    if (!name) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, name)) return res.status(403).json({ message: "Access denied" });
    const team = await Team.findOne({ name }).select("name trainingFee").lean();
    if (!team) return res.status(404).json({ message: "Team not found" });
    const settings = settingsOf(team);
    const { start, end, key } = monthRange(req.query.month);

    const [athletes, sessions, payments] = await Promise.all([
      Athlete.find({ "assignments.team": name }),
      Attendance.find({ team: name, type: "training" }).select("date feePerSession records.athlete records.status").lean(),
      TrainingPayment.find({ team: name }).sort({ date: -1, createdAt: -1 }).lean(),
    ]);

    const rows = new Map();
    for (const a of athletes) {
      const row = flattenAssignments(a, name)[0];
      if (!row) continue;
      rows.set(String(a._id), {
        athlete: a._id,
        fullName: a.fullName || "",
        khmerName: a.khmerName || "",
        photoUrl: a.photoUrl || null,
        jerseyNumber: row.jerseyNumber ?? null,
        role: row.role || "PLAYER",
        plan: "month",
        paidTotal: 0,
        chargedTotal: 0,
        paidMonth: 0,
        chargedMonth: 0,
        attendedMonth: 0,
        missedMonth: 0,
        lastPayment: null,
      });
    }

    let sessionsMonth = 0;
    for (const s of sessions) {
      const inMonth = s.date >= start && s.date < end;
      if (inMonth) sessionsMonth += 1;
      const fee = Number(s.feePerSession) || 0;
      for (const r of s.records || []) {
        const row = rows.get(String(r.athlete));
        if (!row) continue;
        const came = CHARGED.has(r.status);
        if (came) row.chargedTotal += fee;
        if (inMonth) {
          if (came) {
            row.attendedMonth += 1;
            row.chargedMonth += fee;
          } else row.missedMonth += 1;
        }
      }
    }

    // payments are newest first → the first one seen sets the student's plan
    for (const p of payments) {
      const row = rows.get(String(p.athlete));
      if (!row) continue;
      row.paidTotal += p.amount;
      if (p.date >= start && p.date < end) row.paidMonth += p.amount;
      if (!row.lastPayment) {
        row.lastPayment = { amount: p.amount, plan: p.plan, date: p.date };
        row.plan = p.plan;
      }
    }

    const price = settings.pricePerSession;
    const out = [...rows.values()].map((r) => {
      const balance = r.paidTotal - r.chargedTotal;
      // Monthly, not paid yet this month: top the balance back up to one
      // month's fee (leftover sessions from last month make it cheaper).
      // Otherwise (already paid this month, or weekly/daily): only what's owed.
      const toPay =
        r.plan === "month" && r.paidMonth === 0
          ? Math.max(0, settings.monthlyFee - balance)
          : Math.max(0, -balance);
      return {
        ...r,
        balance,
        sessionsLeft: price > 0 ? Math.floor(balance / price) : null,
        toPay,
      };
    });
    out.sort((a, b) => a.balance - b.balance || a.fullName.localeCompare(b.fullName));

    const totals = out.reduce(
      (t, r) => {
        t.paidMonth += r.paidMonth;
        t.chargedMonth += r.chargedMonth;
        if (r.balance < 0) t.owed += -r.balance;
        t.toPay += r.toPay;
        return t;
      },
      { paidMonth: 0, chargedMonth: 0, owed: 0, toPay: 0 }
    );

    res.json({ team: name, month: key, settings: { ...settings, canToggle: canToggle(req) }, sessionsMonth, totals, rows: out });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// GET /api/training-fees/payments?team=X[&athlete=id]
async function listPayments(req, res) {
  try {
    const name = resolveTeam(req);
    if (!name) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, name)) return res.status(403).json({ message: "Access denied" });
    const q = { team: name };
    if (req.query.athlete) q.athlete = req.query.athlete;
    const list = await TrainingPayment.find(q).sort({ date: -1, createdAt: -1 }).limit(500).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// POST /api/training-fees/payments  { team, athlete, amount, plan, date?, note? }
async function createPayment(req, res) {
  try {
    const name = resolveTeam(req);
    if (!name) return res.status(400).json({ message: "Team is required" });
    if (!canAccessTeam(req, name)) return res.status(403).json({ message: "Access denied" });

    const team = await Team.findOne({ name }).select("trainingFee").lean();
    if (!team) return res.status(404).json({ message: "Team not found" });
    if (!settingsOf(team).enabled) return res.status(400).json({ message: "មុខងារហ្វឹកហាត់មិនទាន់បើកសម្រាប់ក្រុមនេះទេ" });

    const { athlete, plan, date, note } = req.body || {};
    const amount = wholeRiel(req.body?.amount);
    if (!athlete) return res.status(400).json({ message: "Athlete is required" });
    if (amount <= 0) return res.status(400).json({ message: "ចំនួនទឹកប្រាក់ត្រូវធំជាង 0" });

    const a = await Athlete.findOne({ _id: athlete, "assignments.team": name }).select("fullName");
    if (!a) return res.status(404).json({ message: "Athlete is not on this team" });

    const payment = await TrainingPayment.create({
      team: name,
      athlete: a._id,
      fullName: a.fullName || "",
      amount,
      plan: PLANS.includes(plan) ? plan : "month",
      date: date ? new Date(date) : new Date(),
      note: typeof note === "string" ? note.trim().slice(0, 200) : "",
      recordedBy: req.adminId,
    });
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// DELETE /api/training-fees/payments/:id — undo a payment entered by mistake.
async function deletePayment(req, res) {
  try {
    const p = await TrainingPayment.findById(req.params.id);
    if (!p) return res.status(404).json({ message: "Payment not found" });
    if (!canAccessTeam(req, p.team)) return res.status(403).json({ message: "Access denied" });
    await p.deleteOne();
    res.json({ message: "Payment deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// One student's training on one team — what the school app shows the
// student themself (via the app-link API, see linkController). null when
// training isn't switched on for that team.
async function athleteTraining(athlete, teamName, month) {
  const team = await Team.findOne({ name: teamName }).select("name nameKm trainingFee").lean();
  if (!team) return null;
  const settings = settingsOf(team);
  if (!settings.enabled) return null;
  const { start, end, key } = monthRange(month);

  const [sessions, payments] = await Promise.all([
    Attendance.find({ team: teamName, type: "training", "records.athlete": athlete._id })
      .select("date title feePerSession records.athlete records.status")
      .sort({ date: 1 })
      .lean(),
    TrainingPayment.find({ team: teamName, athlete: athlete._id }).sort({ date: -1, createdAt: -1 }).lean(),
  ]);

  let charged = 0;
  let attendedMonth = 0;
  let missedMonth = 0;
  const monthSessions = [];
  for (const s of sessions) {
    const rec = (s.records || []).find((r) => String(r.athlete) === String(athlete._id));
    if (!rec) continue;
    const came = CHARGED.has(rec.status);
    const fee = came ? Number(s.feePerSession) || 0 : 0;
    charged += fee;
    if (s.date >= start && s.date < end) {
      if (came) attendedMonth += 1;
      else missedMonth += 1;
      monthSessions.push({ date: s.date, title: s.title || "", status: rec.status, fee });
    }
  }

  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const paidMonth = payments.filter((p) => p.date >= start && p.date < end).reduce((sum, p) => sum + p.amount, 0);
  const plan = payments[0]?.plan || "month";
  const balance = paidTotal - charged;
  const toPay =
    plan === "month" && paidMonth === 0 ? Math.max(0, settings.monthlyFee - balance) : Math.max(0, -balance);

  return {
    team: team.name,
    teamKm: team.nameKm || "",
    month: key,
    pricePerSession: settings.pricePerSession,
    monthlyFee: settings.monthlyFee,
    sessionsPerWeek: settings.sessionsPerWeek,
    plan,
    balance,
    sessionsLeft: settings.pricePerSession > 0 ? Math.floor(balance / settings.pricePerSession) : null,
    toPay,
    paidMonth,
    attendedMonth,
    missedMonth,
    sessions: monthSessions,
    payments: payments.slice(0, 12).map((p) => ({ date: p.date, amount: p.amount, plan: p.plan, note: p.note || "" })),
  };
}
exports.athleteTraining = athleteTraining;

// GET /api/training-fees/teams (Admin) — every team with its training
// on/off switch and prices, for the Admin's training page.
async function listTeams(req, res) {
  try {
    const teams = await Team.find().select("name nameKm trainingFee").sort({ name: 1 }).lean();
    res.json(teams.map((t) => ({ name: t.name, nameKm: t.nameKm || "", ...settingsOf(t) })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { ...exports, listTeams, getSettings, updateSettings, summary, listPayments, createPayment, deletePayment };
