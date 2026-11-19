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

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    req.adminRole = decoded.role || "ADMIN";
    req.adminTeam = decoded.team || null;
    // Only set on an individual Player login (one account per athlete, used
    // for tournament self-registration) — a legacy shared team-wide Player
    // login has no single athlete to point at, so this stays null.
    req.athleteId = decoded.athleteId || null;
    renewIfOld(decoded, res);
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token", code: "TOKEN_EXPIRED" });
  }
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

module.exports = { requireAuth, requireRole };
