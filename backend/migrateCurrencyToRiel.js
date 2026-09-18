// One-time script to convert every existing money amount in the database
// from USD (the currency the app used to be priced in) to Khmer Riel, at
// the rate $1 = ៛4,000 — the same rate the app's code was switched to (see
// backend/utils/subscriptionPlans.js, and the ៛ formatting everywhere else
// in the app). Every number below is just multiplied by 4,000 in place; no
// new records are created and nothing is deleted.
//
// Touches five collections, each holding one kind of money amount:
//   athletes    — assignments[].fees[].amount   (fee/debt rows)
//   payments    — amount                        (payment history)
//   tournaments — entryFee, registrations[].feePaidAmount
//   teams       — subscriptionHistory[].amount  (subscription payment log)
//   products    — price                         (shop item prices)
//
// Run with: node migrateCurrencyToRiel.js
//   - By default this is a DRY RUN: it connects, counts how many documents
//     in each collection have a money field to convert, and prints that —
//     it does NOT change anything in the database.
//   - Add --apply to actually perform the conversion: node
//     migrateCurrencyToRiel.js --apply
//
// IMPORTANT — back up first: this changes real money figures on every
// team's fees, payment history, tournament fees, subscription history, and
// shop prices, all at once. Take a MongoDB Atlas backup (or run `mongodump`)
// before using --apply, the same way you would before any change like this.
//
// IMPORTANT — run this against the SAME database the app is using (whatever
// MONGO_URI in .env points at) — for the live site that's the production
// MongoDB Atlas cluster, same as every other migrateXxx.js script in this
// folder.
//
// Safe against running twice: after a successful --apply, this script
// writes a marker document (_id: "currencyToRielV1") to a "migrations"
// collection. Running it again — dry run or --apply — sees that marker and
// stops immediately without touching any money field a second time (which
// would wrongly multiply everything by 4,000 again). To intentionally
// re-run despite the marker (e.g. you're restoring from a pre-migration
// backup and need to redo it), delete that one document from the
// "migrations" collection first.

require("dotenv").config();
const mongoose = require("mongoose");

const RATE = 4000; // ៛ per $1
const MARKER_ID = "currencyToRielV1";
const apply = process.argv.includes("--apply");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");
  console.log(apply ? "Mode: APPLY (will write changes)" : "Mode: DRY RUN (no changes will be made — pass --apply to actually convert)");
  console.log("");

  const db = mongoose.connection.db;
  const migrations = db.collection("migrations");

  const marker = await migrations.findOne({ _id: MARKER_ID });
  if (marker) {
    console.log(
      `Already run on ${marker.ranAt.toISOString()} — refusing to run again (would double-convert every amount).`
    );
    console.log('Delete the "migrations" document with _id "currencyToRielV1" first if you really need to re-run this.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const athletes = db.collection("athletes");
  const payments = db.collection("payments");
  const tournaments = db.collection("tournaments");
  const teams = db.collection("teams");
  const products = db.collection("products");

  const athleteFilter = { "assignments.fees.0": { $exists: true } };
  const paymentFilter = {};
  const tournamentFilter = { $or: [{ entryFee: { $gt: 0 } }, { "registrations.feePaidAmount": { $gt: 0 } }] };
  const teamFilter = { "subscriptionHistory.0": { $exists: true } };
  const productFilter = {};

  const [athleteCount, paymentCount, tournamentCount, teamCount, productCount] = await Promise.all([
    athletes.countDocuments(athleteFilter),
    payments.countDocuments(paymentFilter),
    tournaments.countDocuments(tournamentFilter),
    teams.countDocuments(teamFilter),
    products.countDocuments(productFilter),
  ]);

  console.log("Documents with a money amount to convert:");
  console.log(`  athletes (fee rows):        ${athleteCount}`);
  console.log(`  payments:                   ${paymentCount}`);
  console.log(`  tournaments:                ${tournamentCount}`);
  console.log(`  teams (subscription history): ${teamCount}`);
  console.log(`  products:                   ${productCount}`);
  console.log("");

  if (!apply) {
    console.log("Dry run only — nothing was changed. Re-run with --apply to convert these for real.");
    await mongoose.disconnect();
    process.exit(0);
  }

  const athleteResult = await athletes.updateMany(athleteFilter, {
    $mul: { "assignments.$[].fees.$[].amount": RATE },
  });
  console.log(`athletes: matched ${athleteResult.matchedCount}, modified ${athleteResult.modifiedCount}`);

  const paymentResult = await payments.updateMany(paymentFilter, { $mul: { amount: RATE } });
  console.log(`payments: matched ${paymentResult.matchedCount}, modified ${paymentResult.modifiedCount}`);

  const tournamentResult = await tournaments.updateMany(tournamentFilter, {
    $mul: { entryFee: RATE, "registrations.$[].feePaidAmount": RATE },
  });
  console.log(`tournaments: matched ${tournamentResult.matchedCount}, modified ${tournamentResult.modifiedCount}`);

  const teamResult = await teams.updateMany(teamFilter, {
    $mul: { "subscriptionHistory.$[].amount": RATE },
  });
  console.log(`teams: matched ${teamResult.matchedCount}, modified ${teamResult.modifiedCount}`);

  const productResult = await products.updateMany(productFilter, { $mul: { price: RATE } });
  console.log(`products: matched ${productResult.matchedCount}, modified ${productResult.modifiedCount}`);

  await migrations.insertOne({ _id: MARKER_ID, ranAt: new Date(), rate: RATE });

  console.log("");
  console.log("Done. Every existing amount has been multiplied by ៛4,000 and the marker document was written.");

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
