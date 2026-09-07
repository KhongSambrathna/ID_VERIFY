const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

function signToken(admin) {
  return jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
}

// POST /api/auth/register  (use once to create your first admin, then remove/protect it)
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }
    const exists = await Admin.findOne({ username });
    if (exists) return res.status(409).json({ message: "Username already taken" });

    const admin = await Admin.create({ username, password });
    const token = signToken(admin);
    res.status(201).json({ token, admin: { id: admin._id, username: admin.username } });
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
    res.json({ token, admin: { id: admin._id, username: admin.username } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
