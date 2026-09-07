// One-time script to regenerate the QR code for EVERY athlete using the
// PUBLIC_BASE_URL currently set in your environment.
//
// Use this after fixing PUBLIC_BASE_URL (e.g. you had it pointed at
// http://localhost:5173 and just changed it to your real deployed URL).
// Old QR codes were baked with the old URL, so they need to be redrawn.
//
// Run with: node regenerateQR.js
// (Make sure PUBLIC_BASE_URL in your .env — or your host's env vars — is
// already set to the correct value before running this.)

require("dotenv").config();
const mongoose = require("mongoose");
const Athlete = require("./models/Athlete");
const generateAthleteQR = require("./utils/generateQR");

async function run() {
  if (!process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.includes("localhost")) {
    console.warn(
      `WARNING: PUBLIC_BASE_URL is currently "${process.env.PUBLIC_BASE_URL}". ` +
        `That looks like a local address, not your public site. Set it to your ` +
        `real domain first (e.g. https://your-app.vercel.app), then re-run this script.`
    );
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");
  console.log(`Regenerating QR codes to point at: ${process.env.PUBLIC_BASE_URL}/verify/<id>`);

  const athletes = await Athlete.find();

  for (const athlete of athletes) {
    const qr = await generateAthleteQR(athlete.verifyId);
    athlete.qrCodeUrl = qr.url;
    athlete.qrCodePublicId = qr.publicId;
    await athlete.save();
    console.log(`Updated QR for "${athlete.fullName}" (${athlete.verifyId})`);
  }

  console.log(`Done. ${athletes.length} QR code(s) regenerated.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Regeneration failed:", err.message);
  process.exit(1);
});
