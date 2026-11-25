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
const tournamentRoutes = require("./routes/tournamentRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const bakongRoutes = require("./routes/bakongRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const packageRoutes = require("./routes/packageRoutes");
const purchasePlanRoutes = require("./routes/purchasePlanRoutes");
const tournamentPlanRoutes = require("./routes/tournamentPlanRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const financeRoutes = require("./routes/financeRoutes");
const telegramRoutes = require("./routes/telegramRoutes");
const geoRoutes = require("./routes/geoRoutes");
const linkRoutes = require("./routes/linkRoutes");

const app = express();

// Render (and most hosts) put the app behind a proxy — without this,
// req.ip is always the proxy's own address, not the real visitor's, which
// would make the QR-verify scan log useless.
app.set("trust proxy", true);

connectDB();

// exposedHeaders lets the browser read the renewed login token the auth
// middleware sends back (sliding session — see middleware/auth.js).
app.use(cors({ exposedHeaders: ["X-Refresh-Token", "X-Account-Changed"] }));
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
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/bakong", bakongRoutes);
app.use("/api/attendance", attendanceRoutes);
// Player self-registration via a Head Coach's shared link — public token
// routes (a brand-new player with no account submits their own details) plus
// coach/admin routes to create & manage those links.
app.use("/api/registration", registrationRoutes);
// Visitor analytics — public page-view tracking + the admin report.
app.use("/api/analytics", analyticsRoutes);
// Shop invoices (Admin) — stock lines cut stock automatically.
app.use("/api/invoices", invoiceRoutes);
// Shop packages/bundles (e.g. tournament package: trophy + medals + fees).
app.use("/api/packages", packageRoutes);
// Purchase planning — costs, delivery dates and expected profit before buying.
app.use("/api/purchase-plans", purchasePlanRoutes);
// Trophy / tournament planning calendar.
app.use("/api/tournament-plans", tournamentPlanRoutes);
// In-website notifications (🔔 in the top bar).
app.use("/api/notifications", notificationRoutes);
// 💬 Chat between accounts.
app.use("/api/chat", chatRoutes);
// Personal finance (Admin): daily income/expenses, debts, monthly plan.
app.use("/api/finance", financeRoutes);
// Telegram shop bot (webhook) + private alerts for the Admin.
app.use("/api/telegram", telegramRoutes);
app.use("/api/geo", geoRoutes);
// read-only team/player API for your other apps (Tournament, Shop)
app.use("/api/link/v1", linkRoutes);
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

// Timed Telegram alerts (debt pay days, weekly "owed to me", daily summary).
// Checked every 10 minutes while the server is awake; each alert is sent once.
if (process.env.TELEGRAM_BOT_TOKEN && process.env.NODE_ENV !== "test") {
  const { runScheduled } = require("./utils/telegramAlerts");
  setTimeout(() => runScheduled().catch(() => {}), 30 * 1000);
  setInterval(() => runScheduled().catch(() => {}), 10 * 60 * 1000);
  // KHQR: ask Bakong about unpaid QR codes every 20 seconds (does nothing
  // when there are none).
  const { runPaymentChecks } = require("./utils/orderPayments");
  const { runFeeChecks } = require("./utils/feePayments");
  setInterval(() => {
    runPaymentChecks().catch(() => {}); // shop orders
    runFeeChecks().catch(() => {}); // student debts + tournament entry fees
  }, 20 * 1000);
}
