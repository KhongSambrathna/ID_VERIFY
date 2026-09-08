require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const athleteRoutes = require("./routes/athleteRoutes");
const coachRoutes = require("./routes/coachRoutes");
const teamRoutes = require("./routes/teamRoutes");
const sponsorRoutes = require("./routes/sponsorRoutes");
const productRoutes = require("./routes/productRoutes");
const shareRoutes = require("./routes/shareRoutes");

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
app.use("/api/sponsors", sponsorRoutes);
app.use("/api/products", productRoutes);
// Social-media share/preview pages — paste these into Facebook/Telegram
// instead of the plain frontend links to get a real preview image
// (see shareController.js for why the SPA can't provide this on its own).
app.use("/share", shareRoutes);

app.get("/", (req, res) => {
  res.send("Athlete Verification API is running");
});

// Centralized error handler — must be registered last, after every route.
// Without this, an error thrown in a route or middleware (e.g. multer's
// fileFilter rejecting a bad file type, or a file over the 10MB limit)
// fell through to Express's default handler: an HTML error page the
// frontend can't parse as JSON (so the user only ever saw a generic
// "Failed to save athlete"), plus a scary stack trace dumped to this
// console. Now the real reason reaches the browser as clean JSON.
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    // e.g. "File too large" when a photo/document is over the 10MB cap
    return res.status(400).json({ message: err.message });
  }
  console.error(err.stack || err.message);
  res.status(err.status || 500).json({ message: err.message || "Something went wrong" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
