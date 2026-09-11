// One-time script to migrate existing Athlete records from the old single
// {team, role, approvalStatus} shape to the new `assignments: [{team, role,
// approvalStatus, pendingRemoval}]` array (one person can now belong to
// several teams and/or hold several roles).
//
// Run with: node migrateAssignments.js
// Safe to run more than once — a record that already has an `assignments`
// array is left untouched, and a record with no team/role to begin with is
// just given an empty `assignments` array.
//
// IMPORTANT: run this against the SAME database the app is using
// (whatever MONGO_URI in .env points at) — for the live site that's the
// production MongoDB Atlas cluster. It talks to the database directly
// through the raw collection, not through the Athlete model, so it works
// correctly whether the new or the old backend code is currently deployed.

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const col = mongoose.connection.db.collection("athletes");
  const cursor = col.find({ assignments: { $exists: false } });

  let migrated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    if (!doc.team && !doc.role) {
      // Nothing to carry over — just give it an empty assignments array so
      // it's no longer picked up by this same query on a future run.
      await col.updateOne({ _id: doc._id }, { $set: { assignments: [] } });
      skipped++;
      continue;
    }

    const assignment = {
      _id: new mongoose.Types.ObjectId(),
      team: doc.team || "",
      role: doc.role || "PLAYER",
      approvalStatus: doc.approvalStatus || "approved",
      pendingRemoval: false,
    };

    await col.updateOne(
      { _id: doc._id },
      {
        $set: { assignments: [assignment] },
        $unset: { team: "", role: "", approvalStatus: "" },
      }
    );

    console.log(`Migrated "${doc.fullName}": ${doc.team || "—"} / ${doc.role || "—"}`);
    migrated++;
  }

  console.log(`Done. ${migrated} record(s) migrated, ${skipped} record(s) had no team/role to carry over.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
