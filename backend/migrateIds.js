// One-time script to upgrade any athlete records still using the old long
// UUID-style verifyId to the new short numeric format (e.g. "001-100-2991"),
// and regenerate their QR code to match.
//
// Run with: node migrateIds.js
// Safe to run more than once — records that already have a short ID
// (13 characters or fewer) are left untouched.

require("dotenv").config();
const mongoose = require("mongoose");
const Athlete = require("./models/Athlete");
const generateShortId = require("./utils/generateShortId");
const generateAthleteQR = require("./utils/generateQR");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const athletes = await Athlete.find();
  let updated = 0;

  for (const athlete of athletes) {
    if (athlete.verifyId && athlete.verifyId.length <= 13) {
      continue; // already a short ID, skip
    }

    const oldId = athlete.verifyId;
    athlete.verifyId = await generateShortId();
    athlete.qrCodeUrl = await generateAthleteQR(athlete.verifyId);
    await athlete.save();

    console.log(`Updated "${athlete.fullName}": ${oldId} -> ${athlete.verifyId}`);
    updated++;
  }

  console.log(`Done. ${updated} record(s) updated, ${athletes.length - updated} already short.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
