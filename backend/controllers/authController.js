const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");

// POST /api/auth/register
// NOTE: After creating your first admin account, comment this out or add guard
exports.register = async (req, res) => {
  try {
    const { username, password, role, team } = req.body;

    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) return res.status(400).json({ message: "User already exists" });

    const admin = new Admin({
      username,
      password,
      role: role || "ADMIN",
      team: team || null,
    });

    await admin.save();
    res.status(201).json({ message: "Admin created", username: admin.username });
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

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        team: admin.team,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        team: admin.team,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};