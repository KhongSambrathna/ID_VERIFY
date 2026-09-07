// One-time script to create the first admin account.
// Run with: node seedAdmin.js
// Then delete this file (or just leave it — running it again for the
// same username will simply say it already exists).

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");

const USERNAME = "admin";
const PASSWORD = "Th01102001";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const exists = await Admin.findOne({ username: USERNAME });
  if (exists) {
    console.log(`Admin "${USERNAME}" already exists — nothing to do.`);
  } else {
    await Admin.create({ username: USERNAME, password: PASSWORD });
    console.log(`Admin created: username="${USERNAME}" password="${PASSWORD}"`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
