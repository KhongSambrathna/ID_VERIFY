const mongoose = require("mongoose");
const ShopPackage = require("../models/ShopPackage");
const Product = require("../models/Product");
const { roundUSD } = require("../utils/currency");
const { changePacked, shortMessage } = require("../utils/packageStock");

// Whole number ≥ 0, or NaN.
function count(v, fallback) {
  const n = num(v, fallback);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

function num(v, fallback = NaN) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Adds live info to a package: current product name/unit/stock for stock
// items, the sum of the items, the final price, and how many packages can be
// sold: the ones already packed + what the shelf stock can still make.
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
      packed: p.packed || 0,
      canMake: canMake === Infinity ? null : canMake + (p.packed || 0), // null = only services
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
    // How many to pack now (default 1) — their stock is cut straight away.
    const packNow = count(req.body.packed, 1);
    if (Number.isNaN(packNow)) return res.status(400).json({ message: "Enter how many packages to pack" });
    const { short } = await changePacked({ name, newItems: items, newCount: packNow, adminId: req.adminId });
    if (short.length) return res.status(400).json({ code: "NOT_ENOUGH_STOCK", short, message: shortMessage(name, short) });
    pkg.packed = packNow;
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
    const oldItems = pkg.items.map((i) => ({ product: i.product, quantity: i.quantity }));
    const oldCount = pkg.packed || 0;
    let newItems = oldItems;
    if (req.body.items !== undefined) {
      const { items, error } = parseItems(req.body.items);
      if (error) return res.status(400).json({ message: error });
      pkg.items = items;
      newItems = items;
    }
    const newCount = count(req.body.packed, oldCount);
    if (Number.isNaN(newCount)) return res.status(400).json({ message: "Enter how many packages are packed" });
    const err = applyBody(pkg, req.body);
    if (err) return res.status(400).json({ message: err });
    if (!pkg.name) return res.status(400).json({ message: "Enter a package name" });
    // Packing more cuts stock; unpacking (or changing the contents) puts the
    // difference back. Refused, with nothing changed, if stock is short.
    const { short } = await changePacked({ name: pkg.name, oldItems, oldCount, newItems, newCount, adminId: req.adminId });
    if (short.length) return res.status(400).json({ code: "NOT_ENOUGH_STOCK", short, message: shortMessage(pkg.name, short) });
    pkg.packed = newCount;
    await pkg.save();
    res.json((await enrich([pkg]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/packages/:id/duplicate — a copy of the package with 1 packed:
// its stock items are cut from the shelf right away. Refused (nothing
// created) if the stock isn't enough. The copy is on sale but hidden from
// the public shop so the shop doesn't list the same package twice.
exports.duplicatePackage = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Package not found" });
    const src = await ShopPackage.findById(req.params.id).lean();
    if (!src) return res.status(404).json({ message: "Package not found" });
    let name = `${src.name} (copy)`;
    for (let n = 2; await ShopPackage.exists({ name }); n++) name = `${src.name} (copy ${n})`;
    const items = src.items.map(({ product, name: itemName, quantity, unitPrice }) => ({ product, name: itemName, quantity, unitPrice }));
    const { short } = await changePacked({ name, newItems: items, newCount: 1, adminId: req.adminId });
    if (short.length) return res.status(400).json({ code: "NOT_ENOUGH_STOCK", short, message: shortMessage(src.name, short) });
    const pkg = await ShopPackage.create({
      name,
      description: src.description,
      items,
      price: src.price,
      isPublic: false,
      active: true,
      packed: 1,
    });
    res.status(201).json((await enrich([pkg]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/packages/:id — packed packages are unpacked first (their
// items go back on the shelf). Invoices already made from it are unaffected.
exports.deletePackage = async (req, res) => {
  try {
    const pkg = await ShopPackage.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: "Package not found" });
    if (pkg.packed > 0) {
      await changePacked({ name: pkg.name, oldItems: pkg.items, oldCount: pkg.packed, newCount: 0, adminId: req.adminId });
    }
    await pkg.deleteOne();
    res.json({ message: "Package deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
