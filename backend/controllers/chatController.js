// 💬 Chat — see models/Chat.js for the rules:
//   same team → chat directly; other teams → friend request first;
//   Admin ↔ anyone directly.
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const Athlete = require("../models/Athlete");
const { Friendship, ChatConversation, ChatMessage, pairKey } = require("../models/Chat");

const isId = (v) => mongoose.isValidObjectId(v);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- who is who -----------------------------------------------------------

// Teams an account belongs to: a coach's team, a player's approved teams.
async function teamsOfMany(accounts) {
  const athleteIds = accounts.filter((a) => a.athleteId).map((a) => a.athleteId);
  const athletes = athleteIds.length
    ? await Athlete.find({ _id: { $in: athleteIds } }).select("fullName khmerName photoUrl assignments.team assignments.approvalStatus").lean()
    : [];
  const byId = new Map(athletes.map((a) => [String(a._id), a]));
  const out = new Map();
  for (const acc of accounts) {
    const teams = new Set();
    if (acc.team) teams.add(acc.team);
    const ath = acc.athleteId && byId.get(String(acc.athleteId));
    if (ath) (ath.assignments || []).filter((x) => x.approvalStatus !== "pending").forEach((x) => x.team && teams.add(x.team));
    out.set(String(acc._id), { teams: [...teams], athlete: ath || null });
  }
  return out;
}

const PERSON_FIELDS = "username role team athleteId displayName photoUrl";

// Name, photo, role and teams for a list of accounts.
async function peopleOf(accounts) {
  const info = await teamsOfMany(accounts);
  return accounts.map((a) => {
    const i = info.get(String(a._id)) || { teams: [], athlete: null };
    return {
      _id: String(a._id),
      name: a.displayName || i.athlete?.fullName || a.username,
      khmerName: i.athlete?.khmerName || "",
      photoUrl: a.photoUrl || i.athlete?.photoUrl || "",
      username: a.username,
      role: a.role,
      teams: i.teams,
    };
  });
}

async function me(req) {
  const acc = await Admin.findById(req.adminId).select(PERSON_FIELDS).lean();
  if (!acc) return null;
  const [p] = await peopleOf([acc]);
  return p;
}

const shareTeam = (a, b) => a.teams.some((t) => b.teams.includes(t));

// How I relate to someone: "admin" / "team" (chat freely), "friend",
// "sent" / "received" (request waiting), "none".
async function relationsFor(meP, others) {
  const keys = others.map((o) => pairKey(meP._id, o._id));
  const fr = await Friendship.find({ key: { $in: keys } }).lean();
  const byKey = new Map(fr.map((f) => [f.key, f]));
  return others.map((o) => {
    const f = byKey.get(pairKey(meP._id, o._id));
    let relation = "none";
    if (meP.role === "ADMIN" || o.role === "ADMIN") relation = "admin";
    else if (shareTeam(meP, o)) relation = "team";
    if (f?.status === "accepted") relation = relation === "none" ? "friend" : relation;
    else if (f && relation === "none") relation = String(f.requester) === meP._id ? "sent" : "received";
    return { ...o, relation, friendshipId: f ? String(f._id) : null, isFriend: f?.status === "accepted" };
  });
}
const canChat = (rel) => ["admin", "team", "friend"].includes(rel);

async function relationWith(meP, otherId) {
  if (!isId(otherId) || String(otherId) === meP._id) return null;
  const acc = await Admin.findById(otherId).select(PERSON_FIELDS).lean();
  if (!acc) return null;
  const [p] = await peopleOf([acc]);
  const [r] = await relationsFor(meP, [p]);
  return r;
}

const fail = (res, err) => res.status(500).json({ message: err.message });

// ---- people ---------------------------------------------------------------

// GET /api/chat/people?q= — my team, my friends, requests; with ?q= search everyone.
exports.people = async (req, res) => {
  try {
    const meP = await me(req);
    if (!meP) return res.status(401).json({ message: "Account not found" });
    const q = String(req.query.q || "").trim();
    let accounts;
    if (q) {
      const rx = new RegExp(esc(q), "i");
      const athletes = await Athlete.find({ $or: [{ fullName: rx }, { khmerName: rx }] }).select("_id").limit(50).lean();
      accounts = await Admin.find({
        _id: { $ne: req.adminId },
        $or: [{ username: rx }, { displayName: rx }, { team: rx }, { athleteId: { $in: athletes.map((a) => a._id) } }],
      })
        .select(PERSON_FIELDS)
        .limit(60)
        .lean();
    } else {
      // Same team (coach accounts + player accounts on my teams), friends, requests.
      const fr = await Friendship.find({ $or: [{ requester: req.adminId }, { recipient: req.adminId }] }).lean();
      const otherIds = fr.map((f) => (String(f.requester) === meP._id ? f.recipient : f.requester));
      const teamAthletes = meP.teams.length
        ? await Athlete.find({ "assignments.team": { $in: meP.teams }, "assignments.approvalStatus": { $ne: "pending" } }).select("_id").lean()
        : [];
      accounts = await Admin.find({
        _id: { $ne: req.adminId },
        $or: [
          { _id: { $in: otherIds } },
          ...(meP.teams.length ? [{ team: { $in: meP.teams } }, { athleteId: { $in: teamAthletes.map((a) => a._id) } }] : []),
          { role: "ADMIN" },
          // An Admin also sees every Head Coach.
          ...(meP.role === "ADMIN" ? [{ role: "HEAD_COACH" }] : []),
        ],
      })
        .select(PERSON_FIELDS)
        .limit(400)
        .lean();
    }
    const people = await relationsFor(meP, await peopleOf(accounts));
    const order = { received: 0, admin: 1, team: 2, friend: 3, sent: 4, none: 5 };
    people.sort((a, b) => order[a.relation] - order[b.relation] || a.name.localeCompare(b.name));
    res.json({ me: meP, people });
  } catch (err) {
    fail(res, err);
  }
};

// ---- friends --------------------------------------------------------------

// POST /api/chat/friends { userId } — send a friend request (other team).
exports.requestFriend = async (req, res) => {
  try {
    const meP = await me(req);
    const other = meP && (await relationWith(meP, req.body.userId));
    if (!other) return res.status(404).json({ message: "Person not found" });
    if (other.relation === "received") {
      // They already asked me — accept it.
      req.params.id = other.friendshipId;
      return exports.acceptFriend(req, res);
    }
    if (other.relation !== "none") return res.json({ relation: other.relation });
    const f = await Friendship.create({ requester: req.adminId, recipient: other._id, key: pairKey(req.adminId, other._id) });
    require("../utils/webNotify").notifyAccounts(
      [{ _id: other._id, role: other.role }],
      `👋 ${meP.name}${meP.teams.length ? ` (${meP.teams.join(", ")})` : ""} ចង់ធ្វើជាមិត្តដើម្បីឆាតជាមួយអ្នក`,
      { kind: "friend", link: "/chat?tab=requests", action: { type: "friend", friendshipId: String(f._id) }, ref: `friend:${f._id}` }
    );
    res.status(201).json({ relation: "sent", friendshipId: String(f._id) });
  } catch (err) {
    if (err.code === 11000) return res.json({ relation: "sent" });
    fail(res, err);
  }
};

// POST /api/chat/friends/:id/accept
exports.acceptFriend = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Not found" });
    const f = await Friendship.findOneAndUpdate(
      { _id: req.params.id, recipient: req.adminId, status: "pending" },
      { $set: { status: "accepted", acceptedAt: new Date() } },
      { new: true }
    );
    if (!f) return res.status(404).json({ message: "Request not found" });
    const web = require("../utils/webNotify");
    web.resolveRef(`friend:${f._id}`, "approve", req.adminId);
    const meP = await me(req);
    const requester = await Admin.findById(f.requester).select("role").lean();
    if (requester)
      web.notifyAccounts([requester], `🤝 ${meP?.name || ""} បានទទួលយកជាមិត្ត — ឥឡូវអាចឆាតបានហើយ`, {
        kind: "friend",
        link: `/chat?with=${req.adminId}`,
      });
    res.json({ relation: "friend", friendshipId: String(f._id) });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/chat/friends/:id/decline — decline a request I got, or cancel one I sent.
exports.declineFriend = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Not found" });
    const f = await Friendship.findOneAndDelete({
      _id: req.params.id,
      status: "pending",
      $or: [{ recipient: req.adminId }, { requester: req.adminId }],
    });
    if (f) require("../utils/webNotify").resolveRef(`friend:${f._id}`, "reject", req.adminId);
    res.json({ relation: "none" });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/chat/friends/:userId — unfriend.
exports.unfriend = async (req, res) => {
  try {
    if (!isId(req.params.userId)) return res.status(404).json({ message: "Not found" });
    await Friendship.deleteOne({ key: pairKey(req.adminId, req.params.userId) });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};

// ---- conversations ----------------------------------------------------------

function unreadFor(conv, userId) {
  if (!conv.last?.at || String(conv.last.sender) === String(userId)) return false;
  const r = (conv.reads || []).find((x) => String(x.user) === String(userId));
  return !r || new Date(r.at) < new Date(conv.last.at);
}

// GET /api/chat/conversations — my chats, newest first.
exports.conversations = async (req, res) => {
  try {
    const meP = await me(req);
    if (!meP) return res.status(401).json({ message: "Account not found" });
    const convs = await ChatConversation.find({ members: req.adminId, hiddenFor: { $ne: req.adminId }, "last.at": { $ne: null } })
      .sort({ "last.at": -1 })
      .limit(100)
      .lean();
    const otherIds = convs.map((c) => c.members.find((m) => String(m) !== meP._id)).filter(Boolean);
    const accounts = await Admin.find({ _id: { $in: otherIds } }).select(PERSON_FIELDS).lean();
    const people = await relationsFor(meP, await peopleOf(accounts));
    const byId = new Map(people.map((p) => [p._id, p]));
    // Unread = messages after my last read.
    const items = await Promise.all(
      convs.map(async (c) => {
        const other = byId.get(String(c.members.find((m) => String(m) !== meP._id)));
        let unread = 0;
        if (unreadFor(c, req.adminId)) {
          const r = (c.reads || []).find((x) => String(x.user) === meP._id);
          unread = await ChatMessage.countDocuments({
            conversation: c._id,
            sender: { $ne: req.adminId },
            deleted: false,
            ...(r ? { createdAt: { $gt: r.at } } : {}),
          });
        }
        return { _id: String(c._id), other: other || null, last: c.last, unread };
      })
    );
    res.json({ items: items.filter((i) => i.other) });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/chat/unread — how many chats have something new (for the 💬 badge).
exports.unread = async (req, res) => {
  try {
    const convs = await ChatConversation.find({ members: req.adminId, "last.at": { $ne: null } }).select("last reads").lean();
    res.json({ unread: convs.filter((c) => unreadFor(c, req.adminId)).length });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/chat/conversations { userId } — open (or start) my chat with someone.
exports.open = async (req, res) => {
  try {
    const meP = await me(req);
    const other = meP && (await relationWith(meP, req.body.userId));
    if (!other) return res.status(404).json({ message: "Person not found" });
    const key = pairKey(req.adminId, other._id);
    let conv = await ChatConversation.findOne({ key }).lean();
    if (!conv && !canChat(other.relation)) {
      return res.status(403).json({ message: "Add as a friend first", code: "NOT_FRIENDS", other });
    }
    if (!conv) {
      try {
        conv = (await ChatConversation.create({ key, members: [req.adminId, other._id] })).toObject();
      } catch (err) {
        if (err.code !== 11000) throw err;
        conv = await ChatConversation.findOne({ key }).lean();
      }
    }
    res.json({ _id: String(conv._id), other, canSend: canChat(other.relation) });
  } catch (err) {
    fail(res, err);
  }
};

async function myConversation(req) {
  if (!isId(req.params.id)) return null;
  return ChatConversation.findOne({ _id: req.params.id, members: req.adminId });
}

// GET /api/chat/conversations/:id/messages?after=&before= — newest 50,
// or only newer than `after` (polling), or older than `before` (scroll up).
exports.messages = async (req, res) => {
  try {
    const conv = await myConversation(req);
    if (!conv) return res.status(404).json({ message: "Chat not found" });
    const filter = { conversation: conv._id };
    if (req.query.after) filter.createdAt = { $gt: new Date(req.query.after) };
    else if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };
    const rows = await ChatMessage.find(filter)
      .sort({ createdAt: req.query.after ? 1 : -1 })
      .limit(req.query.after ? 200 : 50)
      .lean();
    const list = req.query.after ? rows : rows.reverse();
    // When the other person last read — for "seen" under my last message.
    const otherId = conv.members.find((m) => String(m) !== String(req.adminId));
    const otherRead = (conv.reads || []).find((r) => String(r.user) === String(otherId))?.at || null;
    res.json({
      items: list.map((m) => ({ ...m, text: m.deleted ? "" : m.text })),
      more: !req.query.after && rows.length === 50,
      otherRead,
    });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/chat/conversations/:id/messages { text }
exports.send = async (req, res) => {
  try {
    const conv = await myConversation(req);
    if (!conv) return res.status(404).json({ message: "Chat not found" });
    const text = String(req.body.text || "").trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: "Empty message" });
    // Still allowed? (an unfriended cross-team chat becomes read-only)
    const meP = await me(req);
    const otherId = conv.members.find((m) => String(m) !== String(req.adminId));
    const other = await relationWith(meP, otherId);
    if (!other || !canChat(other.relation)) return res.status(403).json({ message: "Add as a friend first", code: "NOT_FRIENDS" });

    const msg = await ChatMessage.create({ conversation: conv._id, sender: req.adminId, text });
    conv.last = { text: text.slice(0, 200), sender: req.adminId, at: msg.createdAt };
    conv.reads = [...(conv.reads || []).filter((r) => String(r.user) !== String(req.adminId)), { user: req.adminId, at: msg.createdAt }];
    conv.hiddenFor = [];
    await conv.save();
    res.status(201).json(msg);
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/chat/conversations/:id/read
exports.markRead = async (req, res) => {
  try {
    const conv = await myConversation(req);
    if (!conv) return res.status(404).json({ message: "Chat not found" });
    const now = new Date();
    conv.reads = [...(conv.reads || []).filter((r) => String(r.user) !== String(req.adminId)), { user: req.adminId, at: now }];
    await conv.save();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/chat/messages/:id — take back my own message.
exports.deleteMessage = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Not found" });
    const m = await ChatMessage.findOneAndUpdate({ _id: req.params.id, sender: req.adminId }, { $set: { deleted: true } }, { new: true });
    if (!m) return res.status(404).json({ message: "Not found" });
    const conv = await ChatConversation.findById(m.conversation);
    if (conv && conv.last?.at && +new Date(conv.last.at) === +m.createdAt) {
      conv.last.text = "";
      await conv.save();
    }
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/chat/conversations/:id — hide from my list (until a new message).
exports.hide = async (req, res) => {
  try {
    const conv = await myConversation(req);
    if (!conv) return res.status(404).json({ message: "Chat not found" });
    if (!conv.hiddenFor.some((u) => String(u) === String(req.adminId))) conv.hiddenFor.push(req.adminId);
    await conv.save();
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
};
