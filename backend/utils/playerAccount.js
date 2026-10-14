const Admin = require("../models/Admin");

// The default password every individual per-athlete Player login is created
// with — the same value the admin "generate missing accounts" action and the
// password-reset flow already use. Kept in one place so the self-registration
// success screen can show the player the exact password their account will
// have, and it can never drift from what's actually set on the account.
// mustChangePassword forces them onto the change-password screen at first
// sign-in, so this shared default is never a long-term secret.
const DEFAULT_PLAYER_PASSWORD = "12345";

// Ensures an athlete has their ONE individual per-athlete Player login,
// creating it if it's missing. Idempotent and safe to call on every approval:
//   - returns the existing account untouched if they already have one;
//   - returns null (skips, creates nothing) if the athlete has no verifyId
//     yet, or if that verifyId is already taken as a username by some other
//     account (so we never clobber an unrelated login).
// Otherwise it creates the login exactly like the bulk "generate missing
// accounts" action does: username = verifyId, default password, PLAYER role,
// linked back via athleteId, forced to change password at first sign-in.
// Used by athleteController's approve/bulk-approve so approving a
// self-registered player automatically provisions their login.
async function ensurePlayerAccountForAthlete(athlete) {
  if (!athlete || !athlete.verifyId) return null;

  const existing = await Admin.findOne({ athleteId: athlete._id });
  if (existing) return existing;

  const usernameTaken = await Admin.exists({ username: athlete.verifyId });
  if (usernameTaken) return null;

  // Team for the login = their PLAYER assignment's team if they have one,
  // else their first assignment's team — same preference the shared roster
  // view relies on, so the login lands on a sensible team.
  const team =
    (athlete.assignments || []).find((a) => a.role === "PLAYER")?.team ||
    (athlete.assignments || [])[0]?.team ||
    "";

  return Admin.create({
    username: athlete.verifyId,
    password: DEFAULT_PLAYER_PASSWORD,
    role: "PLAYER",
    team,
    athleteId: athlete._id,
    mustChangePassword: true,
  });
}

module.exports = { ensurePlayerAccountForAthlete, DEFAULT_PLAYER_PASSWORD };
