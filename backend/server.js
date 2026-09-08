require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const athleteRoutes = require("./routes/athleteRoutes");
const coachRoutes = require("./routes/coachRoutes");
const teamRoutes = require("./routes/teamRoutes");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve uploaded photos / documents / qr codes statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/athletes", athleteRoutes);
app.use("/api/coach", coachRoutes);
app.use("/api/teams", teamRoutes);

app.get("/", (req, res) => {
  res.send("Athlete Verification API is running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
