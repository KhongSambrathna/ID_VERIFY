const jwt = require("jsonwebtoken");

// Sliding session: when a request comes in with a token that's more than a
// day old, a fresh one (full expiry again) is sent back in the
// X-Refresh-Token response header and the frontend swaps it in silently
// (see frontend/src/api/axios.js). So anyone who keeps using the app —
// students especially — is never asked to log in again; only an account
// left unused for the whole expiry period has to sign in once more.
const RENEW_AFTER_SECONDS = 24 * 3600;

function renewIfOld(decoded, res) {
  if (!decoded.iat || Date.now() / 1000 - decoded.iat < RENEW_AFTER_SECONDS) return;
  try {
    const fresh = jwt.sign(
      {
        id: decoded.id,
        role: decoded.role,
        team: decoded.team || null,
        athleteId: decoded.athleteId || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.TOKEN_EXPIRES_IN || "90d" }
    );
    res.setHeader("X-Refresh-Token", fresh);
  } catch {
    // Renewal is best-effort — the current token is still valid.
  }
}

// "Coach mode": an Admin can work as the Head Coach (team captain) of any
// team — register players and teams for tournaments, squad lists, starting
// XI, attendance, jersey orders… exactly like that team's coach. The
// frontend sends the chosen team in the X-Coach-Team header; for an Admin
// token (and only an Admin token) the request is then treated as a
// HEAD_COACH of that team. Without the header the Admin is a normal Admin.
const teamNameCache = new Map();
async function teamExists(name) {
  const hit = teamNameCache.get(name);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.ok;
  const Team = require("../models/Team");
  const ok = Boolean(await Team.exists({ name }));
  if (teamNameCache.size > 500) teamNameCache.clear();
  teamNameCache.set(name, { at: Date.now(), ok });
  return ok;
}

// Current role/team of an account (cached briefly).
const accountCache = new Map();
async function liveAccount(id) {
  const hit = accountCache.get(String(id));
  if (hit && Date.now() - hit.at < 20 * 1000) return hit.acc;
  const Admin = require("../models/Admin");
  const acc = await Admin.findById(id).select("role team athleteId").lean();
  if (accountCache.size > 2000) accountCache.clear();
  accountCache.set(String(id), { at: Date.now(), acc });
  return acc;
}
// Call after changing an account's role/team so it applies at once.
const forgetAccount = (id) => accountCache.delete(String(id));

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = header.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token", code: "TOKEN_EXPIRED" });
  }
  req.adminId = decoded.id;
  req.adminRole = decoded.role || "ADMIN";
  req.adminTeam = decoded.team || null;
  // Only set on an individual Player login (one account per athlete, used
  // for tournament self-registration) — a legacy shared team-wide Player
  // login has no single athlete to point at, so this stays null.
  req.athleteId = decoded.athleteId || null;

  // The Admin can change someone's role/team (Users page) — use what the
  // account is NOW, not what it was when they signed in, and hand them a
  // fresh token right away (X-Account-Changed tells the app to reload).
  try {
    const live = await liveAccount(decoded.id);
    if (!live) return res.status(401).json({ message: "Account no longer exists", code: "TOKEN_EXPIRED" });
    const liveRole = live.role || "ADMIN";
    const liveTeam = live.team || null;
    const liveAthlete = live.athleteId ? String(live.athleteId) : null;
    if (liveRole !== req.adminRole || liveTeam !== req.adminTeam || liveAthlete !== (req.athleteId ? String(req.athleteId) : null)) {
      req.adminRole = liveRole;
      req.adminTeam = liveTeam;
      req.athleteId = liveAthlete;
      renewIfOld({ id: decoded.id, role: liveRole, team: liveTeam, athleteId: liveAthlete, iat: 1 }, res);
      res.setHeader("X-Account-Changed", "1");
    } else {
      renewIfOld(decoded, res);
    }
  } catch (err) {
    renewIfOld(decoded, res); // database hiccup — fall back to the token
  }

  // Sent URI-encoded, since team names are often in Khmer (headers must be ASCII).
  let coachTeam = String(req.headers["x-coach-team"] || "");
  try {
    coachTeam = decodeURIComponent(coachTeam).trim();
  } catch {
    coachTeam = coachTeam.trim();
  }
  if (coachTeam && req.adminRole === "ADMIN") {
    try {
      if (!(await teamExists(coachTeam))) {
        return res.status(400).json({ message: `Team "${coachTeam}" not found — leave coach mode and pick a team again.` });
      }
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
    req.isAdminCoachMode = true;
    req.adminRole = "HEAD_COACH";
    req.adminTeam = coachTeam;
  }
  next();
}

// requireRole("ADMIN") or requireRole("ADMIN", "HEAD_COACH") — must run after
// requireAuth (needs req.adminRole to already be set).
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.adminRole)) {
      return res.status(403).json({ message: "Not allowed for your account role" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, forgetAccount };
