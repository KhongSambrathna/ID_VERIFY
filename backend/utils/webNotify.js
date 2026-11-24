// In-website notifications (🔔 in the top bar) — see models/Notification.js.
// Best-effort like the Telegram ones: never throws into the caller.
const Admin = require("../models/Admin");
const Notification = require("../models/Notification");

// What a notice is about, from its text — used to pick the page it opens.
function guessKind(text) {
  const s = String(text);
  if (/approv|ប្រៀប|ពិនិត្យ|needs approval|re-approval/i.test(s)) return "approval";
  if (/💰|💵|paid|payment|KHQR|បង់|ប្រាក់/i.test(s)) return "payment";
  if (/👕|jersey|អាវ/i.test(s)) return "jersey";
  if (/🏆|tournament|withdraw|registered for|ពាន/i.test(s)) return "tournament";
  if (/🛒|order|BO-\d+|កម្មង់/i.test(s)) return "order";
  if (/🗑️|removed|removal/i.test(s)) return "removal";
  return "info";
}

// Telegram notices use a little HTML (<b>, <code>) — the bell shows plain text.
const plain = (t) =>
  String(t || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

// One id per request, shared by every copy of the notice.
function refOf(action) {
  if (!action) return "";
  if (action.type === "assignment") return `assignment:${action.assignmentId}`;
  if (action.type === "withdrawal") return `withdrawal:${action.registrationId}`;
  if (action.type === "friend") return `friend:${action.friendshipId}`;
  return "";
}

// Request handled (from the bell or from its normal page) → close the
// buttons on every copy.
async function resolveRef(ref, choice, by = null) {
  if (!ref) return;
  try {
    await Notification.updateMany(
      { ref, "resolved.choice": { $in: ["", null] } },
      { $set: { "resolved.choice": choice, "resolved.by": by, "resolved.at": new Date() } }
    );
  } catch (err) {
    console.warn("resolve notification failed:", err.message);
  }
}

// Page to open, per kind and role.
function linkFor(kind, role) {
  const admin = role === "ADMIN";
  switch (kind) {
    case "approval":
      return admin ? "/admin?tab=pendingNew" : "/coach";
    case "payment":
      return admin || role === "HEAD_COACH" ? "/debt-report" : "/player";
    case "jersey":
      return admin ? "/admin/jersey-orders" : role === "PLAYER" ? "/jersey-orders" : "/coach";
    case "tournament":
      return role === "PLAYER" ? "/tournaments" : "/admin/tournaments";
    case "order":
      return "/admin/telegram?tab=orders";
    default:
      return admin ? "/admin" : role === "HEAD_COACH" ? "/coach" : role === "PLAYER" ? "/player" : "/";
  }
}

// Save one notice for each of these accounts.
async function notifyAccounts(accounts, text, { link = "", kind = "", action = null, ref = "" } = {}) {
  try {
    const k = kind || guessKind(text);
    const rows = accounts.map((a) => ({
      recipient: a._id,
      text: plain(text).slice(0, 1000),
      kind: k,
      link: link || linkFor(k, a.role),
      ...(action ? { action, ref: ref || refOf(action) } : ref ? { ref } : {}),
    }));
    if (rows.length) await Notification.insertMany(rows, { ordered: false });
  } catch (err) {
    console.warn("web notify failed:", err.message);
  }
}

const webNotifyAdmins = async (text, opts) =>
  notifyAccounts(await Admin.find({ role: "ADMIN" }).select("_id role").lean(), text, opts);
const webNotifyTeamCoaches = async (team, text, opts) =>
  team ? notifyAccounts(await Admin.find({ role: "HEAD_COACH", team }).select("_id role").lean(), text, opts) : undefined;
// The player's own account(s), found by their athlete record.
const webNotifyAthlete = async (athleteId, text, opts) =>
  athleteId ? notifyAccounts(await Admin.find({ athleteId }).select("_id role").lean(), text, opts) : undefined;

module.exports = { refOf, resolveRef, notifyAccounts, webNotifyAdmins, webNotifyTeamCoaches, webNotifyAthlete, guessKind };
