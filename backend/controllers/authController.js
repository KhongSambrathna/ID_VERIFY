const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Athlete = require("../models/Athlete");
const { sendTelegramMessage } = require("../utils/notify");

function signToken(admin) {
  return jwt.sign(
    {
      id: admin._id,
      role: admin.role,
      team: admin.team || null,
      athleteId: admin.athleteId || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicAdmin(admin) {
  return {
    id: admin._id,
    username: admin.username,
    role: admin.role,
    team: admin.team || null,
    athleteId: admin.athleteId || null,
    mustChangePassword: !!admin.mustChangePassword,
    telegramChatId: admin.telegramChatId || "",
  };
}

// POST /api/auth/register
// Bootstrap-only: creates the very first admin account on a fresh database.
// Once at least one account exists, this route refuses — further accounts
// are created from the admin-only "create user" page (POST /api/auth/users).
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const anyAdminExists = await Admin.exists({});
    if (anyAdminExists) {
      return res.status(403).json({
        message: "An admin account already exists — sign in and create new users from the admin dashboard.",
      });
    }

    const exists = await Admin.findOne({ username });
    if (exists) return res.status(409).json({ message: "Username already taken" });

    const admin = await Admin.create({ username, password, role: "ADMIN" });
    const token = signToken(admin);
    res.status(201).json({ token, admin: publicAdmin(admin) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ message: "Invalid credentials" });

    const match = await admin.comparePassword(password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(admin);
    res.json({ token, admin: publicAdmin(admin) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/users  (admin only) — list every ADMIN/HEAD_COACH/legacy
// shared-Player login account. Individual per-athlete Player accounts
// (created in bulk for tournament self-registration) are excluded here —
// there can be one per athlete, so they'd swamp this list; see
// GET /api/auth/player-accounts for those instead.
exports.listUsers = async (req, res) => {
  try {
    const users = await Admin.find({ athleteId: null })
      .select("username role team telegramChatId createdAt")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/player-accounts  (Admin: every team; Head Coach: own team
// only) — the individual per-athlete Player logins used for tournament
// self-registration, one row per athlete that has one.
exports.listPlayerAccounts = async (req, res) => {
  try {
    const filter = { role: "PLAYER", athleteId: { $ne: null } };
    if (req.adminRole === "HEAD_COACH") filter.team = req.adminTeam;
    const accounts = await Admin.find(filter)
      .select("username team athleteId mustChangePassword telegramChatId createdAt")
      .sort({ username: 1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/player-accounts/generate  (admin only) — creates one
// individual Player login per athlete that doesn't already have one.
// Username = that athlete's own verifyId (e.g. "001-100-2991", dash and
// all — it's already unique and printed on their card, so it's easy for
// them to find and type). Default password "12345"; mustChangePassword
// forces them onto the change-password screen the first time they sign in.
exports.generatePlayerAccounts = async (req, res) => {
  try {
    const athletes = await Athlete.find({}).select("verifyId fullName assignments");
    const existing = await Admin.find({ role: "PLAYER", athleteId: { $ne: null } }).select("athleteId");
    const already = new Set(existing.map((a) => String(a.athleteId)));

    const created = [];
    const skipped = [];
    for (const athlete of athletes) {
      if (already.has(String(athlete._id))) {
        skipped.push({ athleteId: athlete._id, fullName: athlete.fullName, reason: "Already has a login" });
        continue;
      }
      if (!athlete.verifyId) {
        skipped.push({ athleteId: athlete._id, fullName: athlete.fullName, reason: "No verify ID yet" });
        continue;
      }
      try {
        const usernameTaken = await Admin.exists({ username: athlete.verifyId });
        if (usernameTaken) {
          skipped.push({ athleteId: athlete._id, fullName: athlete.fullName, reason: "Username already taken" });
          continue;
        }
        await Admin.create({
          username: athlete.verifyId,
          password: "12345",
          role: "PLAYER",
          team: athlete.assignments[0]?.team || "",
          athleteId: athlete._id,
          mustChangePassword: true,
        });
        created.push({ athleteId: athlete._id, fullName: athlete.fullName, username: athlete.verifyId });
      } catch (err) {
        skipped.push({ athleteId: athlete._id, fullName: athlete.fullName, reason: err.message });
      }
    }

    res.json({ created, skipped });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/player-accounts/:id/reset-password  (Admin: any; Head
// Coach: only an account linked to their own team) — the admin-mediated
// side of "forgot password": back to the default, forced to change again.
exports.resetPlayerPassword = async (req, res) => {
  try {
    const account = await Admin.findOne({ _id: req.params.id, role: "PLAYER", athleteId: { $ne: null } });
    if (!account) return res.status(404).json({ message: "Player account not found" });
    if (req.adminRole === "HEAD_COACH" && account.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }
    account.password = "12345";
    account.mustChangePassword = true;
    await account.save();
    res.json({ message: "Password reset to the default — they'll be asked to change it at next sign-in" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/change-password  (any signed-in account) — the forced
// first-login change, or a voluntary one later. Requires the current
// password (which they do know: either the default "12345", or whatever a
// Telegram self-service reset just texted them), so this never needs a
// separate "old password" recovery path of its own.
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ message: "New password must be at least 4 characters" });
    }
    const account = await Admin.findById(req.adminId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    const match = await account.comparePassword(currentPassword);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });

    account.password = newPassword;
    account.mustChangePassword = false;
    await account.save();

    // Issue a fresh token — the old one may still carry mustChangePassword
    // true, and the frontend swaps it immediately after this call anyway.
    const token = signToken(account);
    res.json({ token, admin: publicAdmin(account) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/forgot-password  (public) — body: { username }. Any
// account type — Admin, Head Coach, an individual per-athlete Player
// login, or the older shared team-wide Player login — can self-serve here
// as long as it already has a Telegram chat id linked (Admin/Head Coach
// link their own from their dashboard; an individual Player links theirs
// from the Tournaments page — see updateMyTelegram below for all of them).
// No such account, or no Telegram linked, gets the exact same generic
// response either way, so this can't be used to probe which usernames
// exist. The no-Telegram-linked case is the expected fallback: link it
// first, then try again — or for a Player, ask an Admin/Head Coach to
// reset it instead (see resetPlayerPassword above).
exports.forgotPassword = async (req, res) => {
  const generic = {
    message: "If that account has Telegram linked, a new temporary password was just sent there.",
  };
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "Username is required" });

    const account = await Admin.findOne({ username });
    if (!account || !account.telegramChatId) return res.json(generic);

    const tempPassword = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
    account.password = tempPassword;
    account.mustChangePassword = true;
    await account.save();

    sendTelegramMessage(
      account.telegramChatId,
      `🔑 Your temporary password is: ${tempPassword}\nSign in with it, then set a new password when asked.`
    );

    res.json(generic);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/me/telegram  (any signed-in account, self-service) — lets
// ANY account (Admin, Head Coach, or an individual Player) link their own
// Telegram chat id, needed for the self-service forgot-password flow
// above. Same manual one-time lookup for everyone: message the bot once,
// then get the numeric chat id from @userinfobot.
exports.updateMyTelegram = async (req, res) => {
  try {
    const account = await Admin.findById(req.adminId);
    if (!account) return res.status(404).json({ message: "Account not found" });
    account.telegramChatId = String(req.body.telegramChatId || "").trim();
    await account.save();
    res.json(publicAdmin(account));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/auth/me  (any signed-in account) — refetches the current
// account's own public info, e.g. so the frontend can re-check
// mustChangePassword without decoding the JWT itself.
exports.me = async (req, res) => {
  try {
    const account = await Admin.findById(req.adminId);
    if (!account) return res.status(404).json({ message: "Account not found" });
    res.json(publicAdmin(account));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/users  (admin only) — create a Head Coach or another Admin login
exports.createUser = async (req, res) => {
  try {
    const { username, password, role, team } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }
    if (role && !["ADMIN", "HEAD_COACH", "PLAYER"].includes(role)) {
      return res.status(400).json({ message: "Role must be ADMIN, HEAD_COACH, or PLAYER" });
    }
    if ((role === "HEAD_COACH" || role === "PLAYER") && !team) {
      return res.status(400).json({ message: "Team is required for a Head Coach or Player account" });
    }

    const exists = await Admin.findOne({ username });
    if (exists) return res.status(409).json({ message: "Username already taken" });

    const user = await Admin.create({
      username,
      password,
      role: role || "ADMIN",
      team: role === "HEAD_COACH" || role === "PLAYER" ? team : undefined,
    });

    res.status(201).json(publicAdmin(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/auth/users/:id  (admin only) — currently just the optional
// Telegram chat id used for notifications; username/role/team are fixed at
// creation (delete and recreate the account to change those).
exports.updateUser = async (req, res) => {
  try {
    const user = await Admin.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (req.body.telegramChatId !== undefined) {
      user.telegramChatId = String(req.body.telegramChatId || "").trim();
    }
    await user.save();
    res.json(publicAdmin(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/auth/users/:id  (admin only)
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.adminId) {
      return res.status(400).json({ message: "You can't delete your own account while signed in" });
    }
    const user = await Admin.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
