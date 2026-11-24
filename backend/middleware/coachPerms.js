// Per-team Head Coach permissions (Team.coachPerms), switched on/off by the
// Admin on the Teams page. coachCan("debts") blocks a Head Coach whose team
// has that switched off; Admins (also in coach mode) are never blocked.
const PERM_KEYS = ["athletes", "debts", "tournaments", "invites", "jersey"];
const DEFAULTS = { athletes: true, debts: true, tournaments: true, invites: false, jersey: true };

const cache = new Map(); // team → { at, perms }
async function permsOf(team) {
  if (!team) return { ...DEFAULTS };
  const hit = cache.get(team);
  if (hit && Date.now() - hit.at < 20 * 1000) return hit.perms;
  const Team = require("../models/Team");
  const t = await Team.findOne({ name: team }).select("coachPerms").lean();
  const perms = { ...DEFAULTS };
  for (const k of PERM_KEYS) if (typeof t?.coachPerms?.[k] === "boolean") perms[k] = t.coachPerms[k];
  if (cache.size > 500) cache.clear();
  cache.set(team, { at: Date.now(), perms });
  return perms;
}
const forgetTeam = (team) => (team ? cache.delete(team) : cache.clear());

const LABELS = {
  athletes: "បន្ថែម/កែ/ដកកីឡាករ (add/edit/remove players)",
  debts: "បំណុល និងការបង់ប្រាក់ (debts & payments)",
  tournaments: "ពាន (tournaments)",
  invites: "Link ចុះឈ្មោះ (registration links)",
  jersey: "កម្មង់អាវ (jersey orders)",
};

function coachCan(key) {
  return async (req, res, next) => {
    if (req.adminRole !== "HEAD_COACH" || req.isAdminCoachMode) return next();
    try {
      const perms = await permsOf(req.adminTeam);
      if (perms[key] !== false) return next();
      return res.status(403).json({
        code: "NO_PERMISSION",
        perm: key,
        message: `Admin បានបិទសិទ្ធិនេះសម្រាប់ក្រុមរបស់អ្នក៖ ${LABELS[key]}`,
      });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  };
}

module.exports = { coachCan, permsOf, forgetTeam, PERM_KEYS, DEFAULTS };
