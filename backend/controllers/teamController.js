const Team = require("../models/Team");
const Athlete = require("../models/Athlete");
const { PLANS, PLAN_ORDER, BILLING_CYCLES, planInfo, priceFor, totalFor, monthsFor } = require("../utils/subscriptionPlans");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

// GET /api/teams  (admin only) — for the Team dropdowns (add athlete, assign coach)
// Each team doc already includes subscriptionPlan/subscriptionExpiresAt/
// subscriptionHistory, plus a computed `playerCount` (one aggregate query
// across every team, not one query per team) so the Admin Subscriptions
// page can show "32 / 40 players" next to each team's plan without a
// separate endpoint.
exports.listTeams = async (req, res) => {
  try {
    const teams = await Team.find().sort({ name: 1 });
    const counts = await Athlete.aggregate([
      { $unwind: "$assignments" },
      { $match: { "assignments.role": "PLAYER" } },
      { $group: { _id: "$assignments.team", n: { $sum: 1 } } },
    ]);
    const countByTeam = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    const withCounts = teams.map((t) => ({ ...t.toObject(), playerCount: countByTeam[t.name] || 0 }));
    res.json(withCounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/teams/plans  (any signed-in role) — the plan/pricing table
// itself, so the Admin Subscriptions page and the Head Coach lock screen
// both read the same numbers from the backend rather than hard-coding them
// twice in the frontend.
exports.listPlans = async (req, res) => {
  const plans = PLAN_ORDER.map((key) => ({
    key,
    maxPlayers: planInfo(key).maxPlayers,
    pricing: Object.keys(BILLING_CYCLES).map((cycle) => ({
      billingCycle: cycle,
      months: monthsFor(cycle),
      pricePerMonth: priceFor(key, cycle),
      total: totalFor(key, cycle),
    })),
  }));
  res.json(plans);
};

// GET /api/teams/mine/subscription  (Head Coach only) — just enough for the
// subscription-lock screen / a "renews on X" banner, without exposing the
// full Team document (or every other team's data) to a Head Coach account.
exports.getMySubscription = async (req, res) => {
  try {
    const team = await Team.findOne({ name: req.adminTeam });
    const expiresAt = team?.subscriptionExpiresAt || null;
    const active = !!(expiresAt && expiresAt.getTime() > Date.now());
    const plan = team?.subscriptionPlan || null;
    res.json({
      team: req.adminTeam,
      active,
      expiresAt,
      plan,
      maxPlayers: plan ? planInfo(plan).maxPlayers : planInfo("BASIC").maxPlayers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/teams/mine/khqr  (Head Coach or Player, own team) — just the
// current KHQR image (or null), for the "scan to pay" card on the Coach
// dashboard and the Player dashboard's pay flow. Never the full Team
// document, same reasoning as getMySubscription above.
exports.getMyKhqr = async (req, res) => {
  try {
    const team = await Team.findOne({ name: req.adminTeam });
    res.json({ team: req.adminTeam, khqrImageUrl: team?.abaKhqrImageUrl || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/teams/mine/khqr  (Head Coach only, multipart: khqr) — uploads
// (replacing any existing one) this Head Coach's own team's static ABA
// Merchant KHQR image. No amount is embedded in it — see the Team model
// comment — this is a stand-in for full PayWay API access, not that flow.
exports.uploadMyKhqr = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "A QR image file is required" });
    const team = await Team.findOne({ name: req.adminTeam });
    if (!team) return res.status(404).json({ message: "Your team was not found" });

    const oldPublicId = team.abaKhqrImagePublicId;
    const { url, publicId } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "athlete-verify/khqr",
      resourceType: "image",
    });
    team.abaKhqrImageUrl = url;
    team.abaKhqrImagePublicId = publicId;
    await team.save();

    if (oldPublicId) {
      cloudinary.uploader.destroy(oldPublicId).catch((err) => console.warn("Old KHQR cleanup failed:", err.message));
    }

    res.json({ khqrImageUrl: team.abaKhqrImageUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/teams/mine/khqr  (Head Coach only) — removes it (e.g. it's
// outdated, or the team switched to a different payment method).
exports.removeMyKhqr = async (req, res) => {
  try {
    const team = await Team.findOne({ name: req.adminTeam });
    if (!team) return res.status(404).json({ message: "Your team was not found" });

    if (team.abaKhqrImagePublicId) {
      cloudinary.uploader
        .destroy(team.abaKhqrImagePublicId)
        .catch((err) => console.warn("KHQR cleanup failed:", err.message));
    }
    team.abaKhqrImageUrl = null;
    team.abaKhqrImagePublicId = null;
    await team.save();

    res.json({ khqrImageUrl: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/teams/logo/:name  (public, no auth) — just the crest image for a
// given team name, for display next to the QR code on that team's players'
// ID cards. No sensitive data here (unlike the KHQR payment image), so this
// sits above the "mine"/admin auth gates below, same reasoning as /plans.
exports.getTeamLogo = async (req, res) => {
  try {
    const team = await Team.findOne({ name: req.params.name });
    res.json({ logoUrl: team?.logoUrl || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/teams/mine/logo  (Head Coach only) — this Head Coach's own
// team's current crest (or null), for the upload card on the Coach
// dashboard.
exports.getMyLogo = async (req, res) => {
  try {
    const team = await Team.findOne({ name: req.adminTeam });
    res.json({ team: req.adminTeam, logoUrl: team?.logoUrl || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/teams/mine/logo  (Head Coach only, multipart: logo) — uploads
// (replacing any existing one) this Head Coach's own team's crest/badge.
exports.uploadMyLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "A logo image file is required" });
    const team = await Team.findOne({ name: req.adminTeam });
    if (!team) return res.status(404).json({ message: "Your team was not found" });

    const oldPublicId = team.logoPublicId;
    const { url, publicId } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "athlete-verify/logos",
      resourceType: "image",
    });
    team.logoUrl = url;
    team.logoPublicId = publicId;
    await team.save();

    if (oldPublicId) {
      cloudinary.uploader.destroy(oldPublicId).catch((err) => console.warn("Old team logo cleanup failed:", err.message));
    }

    res.json({ logoUrl: team.logoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/teams/mine/logo  (Head Coach only)
exports.removeMyLogo = async (req, res) => {
  try {
    const team = await Team.findOne({ name: req.adminTeam });
    if (!team) return res.status(404).json({ message: "Your team was not found" });

    if (team.logoPublicId) {
      cloudinary.uploader.destroy(team.logoPublicId).catch((err) => console.warn("Team logo cleanup failed:", err.message));
    }
    team.logoUrl = null;
    team.logoPublicId = null;
    await team.save();

    res.json({ logoUrl: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/teams/:id/logo  (admin only, multipart: logo) — lets an Admin
// upload/replace a crest for ANY team directly, without needing that
// team's Head Coach to do it themselves (e.g. the team has no Head Coach
// account yet, or the Admin already has every club's logo on hand).
exports.uploadTeamLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "A logo image file is required" });
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const oldPublicId = team.logoPublicId;
    const { url, publicId } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "athlete-verify/logos",
      resourceType: "image",
    });
    team.logoUrl = url;
    team.logoPublicId = publicId;
    await team.save();

    if (oldPublicId) {
      cloudinary.uploader.destroy(oldPublicId).catch((err) => console.warn("Old team logo cleanup failed:", err.message));
    }

    res.json({ logoUrl: team.logoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/teams/:id/logo  (admin only)
exports.removeTeamLogo = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (team.logoPublicId) {
      cloudinary.uploader.destroy(team.logoPublicId).catch((err) => console.warn("Team logo cleanup failed:", err.message));
    }
    team.logoUrl = null;
    team.logoPublicId = null;
    await team.save();

    res.json({ logoUrl: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/teams/:id/subscription  (admin only) — records a payment taken
// outside the app (bank transfer, Wing/ABA, Telegram, cash, ...). Body:
// { plan: "BASIC"|"PRO"|"PRO_MAX"|"UNLIMITED", billingCycle: "MONTHLY"|
// "HALF_YEAR"|"YEARLY", amount? (defaults to that plan/cycle's list price,
// but an Admin can override it for a discount or partial payment), note? }.
// Renewing early extends from the CURRENT expiry date (if it's still in the
// future) rather than from today, so paying ahead never wastes time already
// owed; a lapsed or first-time subscription simply starts from today.
// Switching plan takes effect immediately (the new plan's player cap
// applies right away) — this deliberately doesn't try to prorate a
// mid-cycle plan change, since payment is recorded by hand anyway.
exports.recordSubscriptionPayment = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const plan = PLANS[req.body.plan] ? req.body.plan : null;
    if (!plan) return res.status(400).json({ message: "A valid plan (BASIC, PRO, PRO_MAX, UNLIMITED) is required" });

    const billingCycle = BILLING_CYCLES[req.body.billingCycle] ? req.body.billingCycle : "YEARLY";
    const months = monthsFor(billingCycle);
    const amount =
      req.body.amount !== undefined && req.body.amount !== "" ? Number(req.body.amount) : totalFor(plan, billingCycle);
    const note = (req.body.note || "").trim();

    const now = new Date();
    const base = team.subscriptionExpiresAt && team.subscriptionExpiresAt.getTime() > now.getTime() ? team.subscriptionExpiresAt : now;
    const expiresAt = new Date(base);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    team.subscriptionPlan = plan;
    team.subscriptionExpiresAt = expiresAt;
    team.subscriptionHistory.push({ plan, billingCycle, amount, months, paidAt: now, expiresAt, note, recordedBy: req.adminId });
    await team.save();

    res.json(team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/teams/:id/subscription/revoke  (admin only) — immediately cuts
// off an active subscription instead of waiting for it to expire naturally.
// Two intended uses: (1) testing the paywall lock without waiting for a real
// expiry date, (2) a customer refund, where the team should lose access to
// the time they were refunded for right away. This does not erase the
// team's plan or its payment history — it only backdates
// subscriptionExpiresAt to now (so the existing "expired" status/UI apply
// unchanged) and appends a zero-amount audit entry noting the revoke, with
// whatever reason the Admin typed in.
exports.revokeSubscription = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: "Team not found" });

    const now = new Date();
    const wasActive = !!(team.subscriptionExpiresAt && team.subscriptionExpiresAt.getTime() > now.getTime());
    if (!wasActive) {
      return res.status(400).json({ message: "This team doesn't have an active subscription to revoke." });
    }

    const note = (req.body.note || "").trim();
    const plan = team.subscriptionPlan || "BASIC";
    const lastEntry = team.subscriptionHistory[team.subscriptionHistory.length - 1];
    const billingCycle = lastEntry?.billingCycle || "MONTHLY";

    team.subscriptionHistory.push({
      plan,
      billingCycle,
      amount: 0,
      months: 0,
      paidAt: now,
      expiresAt: now,
      note: note ? `Revoked: ${note}` : "Revoked by Admin",
      recordedBy: req.adminId,
    });
    team.subscriptionExpiresAt = now;
    await team.save();

    res.json(team);
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
