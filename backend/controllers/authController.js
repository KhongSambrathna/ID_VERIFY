const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

function signToken(admin) {
  return jwt.sign(
    { id: admin._id, role: admin.role, team: admin.team || null },
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

// GET /api/auth/users  (admin only) — list every login account
exports.listUsers = async (req, res) => {
  try {
    const users = await Admin.find()
      .select("username role team telegramChatId createdAt")
      .sort({ createdAt: -1 });
    res.json(users);
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
