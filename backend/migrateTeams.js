// One-time script: pulls every distinct team name already typed on existing
// athlete records and saves it into the new Team collection, so the team
// dropdown isn't empty after upgrading — you don't have to retype every
// team name that's already in use.
//
// Run with: node migrateTeams.js

require("dotenv").config();
const mongoose = require("mongoose");
const Athlete = require("./models/Athlete");
const Team = require("./models/Team");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const teamNames = await Athlete.distinct("team");
  const cleanNames = [...new Set(teamNames.map((t) => (t || "").trim()).filter(Boolean))];

  let created = 0;
  for (const name of cleanNames) {
    const exists = await Team.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
    if (exists) {
      console.log(`Skipping "${name}" — already have "${exists.name}"`);
      continue;
    }
    await Team.create({ name });
    created++;
    console.log(`Added team: "${name}"`);
  }

  console.log(`Done. ${created} team(s) added out of ${cleanNames.length} found on athlete records.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
