// One-time script: the shop is now priced in US DOLLARS (everything else in
// the app — fees, payments, tournaments, subscriptions — stays in Riel).
// Shop amounts already saved in the database were entered in Riel, so this
// divides them by 4,000 ($1 = ៛4,000, the same rate migrateCurrencyToRiel.js
// used) and rounds to the cent. Nothing is created or deleted.
//
// Touches two collections:
//   products       — price, costPrice
//   stockmovements — unitPrice, unitCost, totalAmount, profit
//
// Run with: node migrateShopToUSD.js
//   - By default this is a DRY RUN: it shows what each product's price
//     would become, without changing anything.
//   - Add --apply to actually convert: node migrateShopToUSD.js --apply
//
// Only run it if your shop prices currently look like Riel (e.g. "$40,000.00"
// for a ball). If you already re-typed the prices in dollars by hand, DON'T
// run it — it would divide them by 4,000 again.
//
// Back up first (MongoDB Atlas backup or `mongodump`), and run it against
// the same database the app uses (MONGO_URI in .env).
//
// Safe against running twice: after --apply it writes a marker document
// (_id: "shopToUSDV1") to the "migrations" collection and refuses to run
// again while that marker exists.

require("dotenv").config();
const mongoose = require("mongoose");

const RATE = 4000; // ៛ per $1
const MARKER_ID = "shopToUSDV1";
const apply = process.argv.includes("--apply");

// Divide a field by RATE and round to 2 decimals, inside an update pipeline.
const toUSD = (field) => ({ $round: [{ $divide: [{ $ifNull: [`$${field}`, 0] }, RATE] }, 2] });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");
  console.log(apply ? "Mode: APPLY (will write changes)" : "Mode: DRY RUN (no changes — pass --apply to convert)");
  console.log("");

  const db = mongoose.connection.db;
  const migrations = db.collection("migrations");
  const marker = await migrations.findOne({ _id: MARKER_ID });
  if (marker) {
    console.log(`Already run on ${marker.ranAt.toISOString()} — refusing to run again (would divide prices twice).`);
    console.log(`Delete the "migrations" document with _id "${MARKER_ID}" first if you really need to re-run this.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const products = db.collection("products");
  const movements = db.collection("stockmovements");

  const list = await products.find({}, { projection: { name: 1, price: 1, costPrice: 1 } }).toArray();
  const movementCount = await movements.countDocuments();
  console.log(`products: ${list.length}, stock in/out records: ${movementCount}`);
  console.log("");
  list.forEach((p) => {
    const price = Math.round(((p.price || 0) / RATE) * 100) / 100;
    const cost = Math.round(((p.costPrice || 0) / RATE) * 100) / 100;
    console.log(`  ${p.name}: price ${p.price} → $${price.toFixed(2)}, cost ${p.costPrice || 0} → $${cost.toFixed(2)}`);
  });

  if (!apply) {
    console.log("");
    console.log("Dry run only — nothing changed. Run again with --apply to convert.");
    await mongoose.disconnect();
    process.exit(0);
  }

  const pr = await products.updateMany({}, [{ $set: { price: toUSD("price"), costPrice: toUSD("costPrice") } }]);
  console.log(`products: modified ${pr.modifiedCount}`);
  const mr = await movements.updateMany({}, [
    {
      $set: {
        unitPrice: toUSD("unitPrice"),
        unitCost: toUSD("unitCost"),
        totalAmount: toUSD("totalAmount"),
        profit: toUSD("profit"),
      },
    },
  ]);
  console.log(`stock in/out records: modified ${mr.modifiedCount}`);

  await migrations.insertOne({ _id: MARKER_ID, ranAt: new Date(), rate: RATE });
  console.log("");
  console.log("Done. Shop amounts are now in US dollars and the marker document was written.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
