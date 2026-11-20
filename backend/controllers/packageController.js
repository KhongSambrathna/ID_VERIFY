const mongoose = require("mongoose");
const ShopPackage = require("../models/ShopPackage");
const Product = require("../models/Product");
const { roundUSD } = require("../utils/currency");

function num(v, fallback = NaN) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Adds live info to a package: current product name/unit/stock for stock
// items, the sum of the items, the final price, and how many packages the
// current stock can still make.
async function enrich(pkgs, { publicView = false } = {}) {
  const ids = [...new Set(pkgs.flatMap((p) => p.items.filter((i) => i.product).map((i) => String(i.product))))];
  const products = await Product.find({ _id: { $in: ids } }).select("name unit stock imageUrl").lean();
  const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));
  return pkgs.map((doc) => {
    const p = doc.toObject ? doc.toObject() : doc;
    let canMake = Infinity;
    const items = p.items.map((it) => {
      const prod = it.product ? byId[String(it.product)] : null;
      if (it.product) {
        const stock = prod ? prod.stock : 0;
        canMake = Math.min(canMake, it.quantity > 0 ? Math.floor(stock / it.quantity) : Infinity);
      }
      const row = {
        _id: it._id,
        product: it.product || null,
        name: prod ? prod.name : it.name,
        unit: prod ? prod.unit || "pcs" : "",
        imageUrl: prod ? prod.imageUrl : null,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: roundUSD(it.quantity * it.unitPrice),
        missing: Boolean(it.product && !prod),
      };
      if (!publicView) row.stock = prod ? prod.stock : 0;
      return row;
    });
    const itemsTotal = roundUSD(items.reduce((s, i) => s + i.total, 0));
    const finalPrice = p.price === null || p.price === undefined ? itemsTotal : roundUSD(p.price);
    return {
      ...p,
      items,
      itemsTotal,
      finalPrice,
      saving: roundUSD(Math.max(itemsTotal - finalPrice, 0)),
      canMake: canMake === Infinity ? null : canMake, // null = only services
    };
  });
}

function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Add at least one item" };
  const items = [];
  for (const [i, it] of raw.entries()) {
    const qty = num(it.quantity);
    const price = num(it.unitPrice);
    if (Number.isNaN(qty) || qty <= 0) return { error: `Line ${i + 1}: enter a quantity` };
    if (Number.isNaN(price) || price < 0) return { error: `Line ${i + 1}: enter a valid price` };
    if (it.productId) {
      if (!mongoose.isValidObjectId(it.productId)) return { error: `Line ${i + 1}: invalid product` };
      if (!Number.isInteger(qty)) return { error: `Line ${i + 1}: stock items need a whole-number quantity` };
      items.push({ product: it.productId, name: "", quantity: qty, unitPrice: roundUSD(price) });
    } else {
      const name = String(it.name || "").trim();
      if (!name) return { error: `Line ${i + 1}: enter a description` };
      items.push({ product: null, name, quantity: qty, unitPrice: roundUSD(price) });
    }
  }
  return { items };
}

function applyBody(pkg, body) {
  if (body.name !== undefined) pkg.name = String(body.name).trim();
  if (body.description !== undefined) pkg.description = String(body.description).trim();
  if (body.price !== undefined) {
    const p = num(body.price, null);
    if (p !== null && (Number.isNaN(p) || p < 0)) return "Enter a valid package price";
    pkg.price = p === null ? null : roundUSD(p);
  }
  if (body.isPublic !== undefined) pkg.isPublic = Boolean(body.isPublic);
  if (body.active !== undefined) pkg.active = Boolean(body.active);
  return null;
}

// GET /api/packages (admin) — all packages with live stock info
exports.listPackages = async (req, res) => {
  try {
    const pkgs = await ShopPackage.find().sort({ active: -1, name: 1 });
    res.json(await enrich(pkgs));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/packages/public (PUBLIC) — active, public packages that the
// current stock can still make. No buying costs or stock numbers.
exports.listPublicPackages = async (req, res) => {
  try {
    const pkgs = await ShopPackage.find({ active: true, isPublic: true }).sort({ name: 1 });
    const out = (await enrich(pkgs, { publicView: true })).filter((p) => p.canMake === null || p.canMake > 0);
    res.json(out.map(({ canMake, ...rest }) => rest));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/packages  { name, description?, price?, isPublic?, items: [{ productId? | name, quantity, unitPrice }] }
exports.createPackage = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Enter a package name" });
    const { items, error } = parseItems(req.body.items);
    if (error) return res.status(400).json({ message: error });
    const pkg = new ShopPackage({ name, items });
    const err = applyBody(pkg, req.body);
    if (err) return res.status(400).json({ message: err });
    await pkg.save();
    res.status(201).json((await enrich([pkg]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/packages/:id — same body as create (items optional)
exports.updatePackage = async (req, res) => {
  try {
    const pkg = await ShopPackage.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: "Package not found" });
    if (req.body.items !== undefined) {
      const { items, error } = parseItems(req.body.items);
      if (error) return res.status(400).json({ message: error });
      pkg.items = items;
    }
    const err = applyBody(pkg, req.body);
    if (err) return res.status(400).json({ message: err });
    if (!pkg.name) return res.status(400).json({ message: "Enter a package name" });
    await pkg.save();
    res.json((await enrich([pkg]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/packages/:id — invoices already made from it are unaffected.
exports.deletePackage = async (req, res) => {
  try {
    const pkg = await ShopPackage.findByIdAndDelete(req.params.id);
    if (!pkg) return res.status(404).json({ message: "Package not found" });
    res.json({ message: "Package deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
