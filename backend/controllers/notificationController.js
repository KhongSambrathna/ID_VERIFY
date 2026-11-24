const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// GET /api/notifications?limit=30 — my latest notices + how many are unread.
exports.list = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const [items, unread] = await Promise.all([
      Notification.find({ recipient: req.adminId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("resolved.by", "displayName username")
        .lean(),
      Notification.countDocuments({ recipient: req.adminId, readAt: null }),
    ]);
    res.json({ items, unread });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/notifications/count — just the unread number (cheap, polled).
exports.count = async (req, res) => {
  try {
    res.json({ unread: await Notification.countDocuments({ recipient: req.adminId, readAt: null }) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Not found" });
    await Notification.updateOne({ _id: req.params.id, recipient: req.adminId, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.adminId, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/notifications — clear all of mine.
exports.clearAll = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.adminId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Run an existing handler as the signed-in user (same permission checks as
// on its normal page) and capture what it answers.
function runAs(handler, req, params, body) {
  return new Promise((resolve) => {
    const fake = {
      params,
      body: body || {},
      query: {},
      adminId: req.adminId,
      adminRole: req.adminRole,
      adminTeam: req.adminTeam,
      athleteId: req.athleteId,
    };
    let status = 200;
    const res = {
      status(c) {
        status = c;
        return res;
      },
      json(data) {
        resolve({ status, data });
        return res;
      },
      send(data) {
        resolve({ status, data });
        return res;
      },
    };
    Promise.resolve(handler(fake, res)).catch((err) => resolve({ status: 500, data: { message: err.message } }));
  });
}

// POST /api/notifications/:id/act  { choice: "approve" | "reject", reason }
// — the ✅ / ❌ buttons on a notice. Checks the request is still waiting
// (someone may have handled it already), then does it.
exports.act = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Not found" });
    const n = await Notification.findOne({ _id: req.params.id, recipient: req.adminId });
    if (!n || !n.action?.type) return res.status(404).json({ message: "Not found" });
    const choice = req.body?.choice === "reject" ? "reject" : req.body?.choice === "approve" ? "approve" : "";
    if (!choice) return res.status(400).json({ message: "Choose approve or reject" });
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (n.resolved?.choice) return res.status(409).json({ message: "Already handled", resolved: n.resolved });

    const close = async (c) => {
      const { resolveRef } = require("../utils/webNotify");
      await resolveRef(n.ref, c, req.adminId);
      await Notification.updateOne({ _id: n._id }, { $set: { readAt: n.readAt || new Date() } });
      return Notification.findById(n._id).lean();
    };
    const a = n.action;

    if (a.type === "assignment") {
      if (req.adminRole !== "ADMIN") return res.status(403).json({ message: "Only an Admin can do this" });
      const Athlete = require("../models/Athlete");
      const athlete = mongoose.isValidObjectId(a.athleteId) ? await Athlete.findById(a.athleteId) : null;
      const asg = athlete && athlete.assignments.id(a.assignmentId);
      if (!asg || !(asg.pendingRemoval || asg.approvalStatus === "pending")) {
        const item = await close("gone");
        return res.status(409).json({ message: "Already handled", item });
      }
      const c = require("./athleteController");
      const out = await runAs(choice === "approve" ? c.approveAssignment : c.rejectAssignment, req, { id: a.athleteId, assignmentId: a.assignmentId }, { reason });
      if (out.status >= 400) return res.status(out.status).json(out.data);
      return res.json({ ok: true, item: await close(choice) });
    }

    if (a.type === "withdrawal") {
      const Tournament = require("../models/Tournament");
      const t = mongoose.isValidObjectId(a.tournamentId) ? await Tournament.findById(a.tournamentId) : null;
      const row = t && t.registrations.id(a.registrationId);
      if (!row || !row.pendingRemoval) {
        const item = await close("gone");
        return res.status(409).json({ message: "Already handled", item });
      }
      const c = require("./tournamentController");
      const out = await runAs(choice === "approve" ? c.unregister : c.keepRegistration, req, { id: a.tournamentId, registrationId: a.registrationId }, { reason });
      if (out.status >= 400) return res.status(out.status).json(out.data);
      return res.json({ ok: true, item: await close(choice) });
    }

    if (a.type === "friend") {
      const { Friendship } = require("../models/Chat");
      const f = mongoose.isValidObjectId(a.friendshipId)
        ? await Friendship.findOne({ _id: a.friendshipId, recipient: req.adminId, status: "pending" })
        : null;
      if (!f) {
        const item = await close("gone");
        return res.status(409).json({ message: "Already handled", item });
      }
      const c = require("./chatController");
      const out = await runAs(choice === "approve" ? c.acceptFriend : c.declineFriend, req, { id: a.friendshipId }, {});
      if (out.status >= 400) return res.status(out.status).json(out.data);
      return res.json({ ok: true, item: await close(choice) });
    }

    res.status(400).json({ message: "Unknown action" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
