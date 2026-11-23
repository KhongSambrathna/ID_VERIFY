const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");

// Packed packages: a package's stock items are taken off the shelf when the
// package is packed (created, duplicated, "+1 pack"), and put back when it is
// unpacked or deleted. Each change is logged as an ADJUST movement so the
// stock history shows where the items went.

// { productId: total quantity } for `count` packages of `items`.
function totals(items, count) {
  const m = new Map();
  if (!count) return m;
  for (const it of items || []) {
    if (!it.product) continue;
    const id = String(it.product._id || it.product);
    m.set(id, (m.get(id) || 0) + it.quantity * count);
  }
  return m;
}

// Change what a package holds from (oldItems × oldCount) to
// (newItems × newCount). Checks every product first; if any is short,
// nothing changes and { short: [{ name, need, have, unit }] } is returned.
// extraAvailable: { productId: qty } that may be counted as available too.
async function changePacked({ name, oldItems = [], oldCount = 0, newItems = [], newCount = 0, adminId, note }) {
  const before = totals(oldItems, oldCount);
  const after = totals(newItems, newCount);
  const ids = [...new Set([...before.keys(), ...after.keys()])];
  const products = await Product.find({ _id: { $in: ids } });
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));

  const deltas = [];
  const short = [];
  for (const id of ids) {
    const delta = (after.get(id) || 0) - (before.get(id) || 0); // + = take from shelf
    if (!delta) continue;
    const p = byId[id];
    if (!p) {
      if (delta > 0) short.push({ name: "?", need: delta, have: 0, unit: "" });
      continue;
    }
    if (delta > p.stock) short.push({ name: p.name, need: delta, have: p.stock, unit: p.unit || "pcs" });
    deltas.push({ p, delta });
  }
  if (short.length) return { short };

  for (const { p, delta } of deltas) {
    p.stock -= delta;
    await p.save();
    await StockMovement.create({
      product: p._id,
      productName: p.name,
      type: "ADJUST",
      quantity: -delta,
      note: note || (delta > 0 ? `Packed into package "${name}"` : `Unpacked from package "${name}"`),
      createdBy: adminId,
    });
  }
  if (deltas.length) require("./telegramAlerts").stockChanged(deltas.map((d) => d.p._id));
  return { short: [] };
}

// Message for a refused change, in both languages.
function shortMessage(pkgName, short) {
  const lines = short.map((s) => `• ${s.name}: need ${s.need}, only ${s.have} ${s.unit} left / ត្រូវការ ${s.need} មានតែ ${s.have}`);
  return `Not enough stock for package "${pkgName}" / ស្តុកមិនគ្រប់សម្រាប់កញ្ចប់ "${pkgName}":\n${lines.join("\n")}`;
}

module.exports = { changePacked, shortMessage, totals };
