const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");
// Shop prices are in US dollars (rounded to the cent) — see utils/currency.js.
const { roundUSD } = require("../utils/currency");

// Reports group sales by day in Cambodia's local time, not UTC — otherwise
// a sale at 6am Phnom Penh time would land on the previous day.
const TZ = "Asia/Phnom_Penh";
const TZ_OFFSET = "+07:00";

function num(v, fallback = NaN) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// "2026-11-19" → start of that day in Phnom Penh time.
function parseDay(str, endOfDay = false) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(`${str}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Movement date from the form ("2026-11-19") — stored at local noon so it
// can't drift onto a neighbouring day; no date → right now.
function movementDate(str) {
  if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T12:00:00${TZ_OFFSET}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

// Total units sold per product, all time — { productId: qty }.
async function soldCounts() {
  const rows = await StockMovement.aggregate([
    { $match: { type: "OUT" } },
    { $group: { _id: "$product", qty: { $sum: "$quantity" } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.qty]));
}

// Best sellers first (most units sold), then A–Z for items never sold.
function sortBestSellersFirst(products, sold) {
  return products
    .map((p) => ({ ...(p.toObject ? p.toObject() : p), soldCount: sold[String(p._id)] || 0 }))
    .sort((a, b) => b.soldCount - a.soldCount || a.name.localeCompare(b.name));
}

// GET /api/products (admin) — full shop/inventory list, best sellers first,
// each with soldCount (units sold all time).
exports.listProducts = async (req, res) => {
  try {
    const [products, sold] = await Promise.all([Product.find(), soldCounts()]);
    res.json(sortBestSellersFirst(products, sold));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/products/public (PUBLIC) — the storefront reads this without
// logging in.
//   • Out-of-stock items are hidden (they reappear as soon as stock is added).
//   • Best sellers are listed first; the top 3 that have sold get
//     bestSeller: true for a "🔥 Best seller" badge.
//   • Buying cost, sales numbers and imagePublicId are private, never sent.
exports.listPublicProducts = async (req, res) => {
  try {
    const [products, sold] = await Promise.all([
      Product.find({ stock: { $gt: 0 } }).select("-imagePublicId -costPrice -lowStockAlert").lean(),
      soldCounts(),
    ]);
    const sorted = sortBestSellersFirst(products, sold).map((p, i) => {
      const { soldCount, ...rest } = p;
      return { ...rest, bestSeller: i < 3 && soldCount > 0 };
    });
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/products (admin, multipart/form-data:
//   name, price, costPrice, stock, unit, lowStockAlert, image)
// A starting stock > 0 is recorded as an opening stock-in at costPrice, so
// it shows in the purchase history like any other restock.
exports.createProduct = async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const price = num(req.body.price);
    const costPrice = num(req.body.costPrice, 0);
    const stock = num(req.body.stock, 0);
    const lowStockAlert = num(req.body.lowStockAlert, 5);
    const unit = (req.body.unit || "pcs").trim() || "pcs";

    if (!name) return res.status(400).json({ message: "Product name is required" });
    if (Number.isNaN(price) || price < 0) return res.status(400).json({ message: "Enter a valid selling price" });
    if (Number.isNaN(costPrice) || costPrice < 0) return res.status(400).json({ message: "Enter a valid cost price" });
    if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      return res.status(400).json({ message: "Enter a valid stock quantity" });
    }
    if (Number.isNaN(lowStockAlert) || lowStockAlert < 0) {
      return res.status(400).json({ message: "Enter a valid low-stock alert level" });
    }
    if (!req.files?.image?.[0]) return res.status(400).json({ message: "Product photo is required" });

    const { url, publicId } = await uploadBufferToCloudinary(req.files.image[0].buffer, {
      folder: "athlete-verify/products",
      resourceType: "image",
    });

    const product = await Product.create({
      name,
      price: roundUSD(price),
      costPrice: roundUSD(costPrice),
      stock,
      unit,
      lowStockAlert,
      imageUrl: url,
      imagePublicId: publicId,
    });

    if (stock > 0) {
      await StockMovement.create({
        product: product._id,
        productName: product.name,
        type: "IN",
        quantity: stock,
        unitPrice: product.costPrice,
        unitCost: product.costPrice,
        totalAmount: roundUSD(stock * product.costPrice),
        note: "Opening stock",
        createdBy: req.adminId,
      });
    }

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/products/:id (admin) — edit name/price/costPrice/stock/unit/photo.
// Also used by the quick ± stock steppers, which just send { stock } as
// plain JSON. Any stock change made here is logged as an ADJUST movement,
// so the history always explains where the current count came from.
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name) product.name = name;
    }
    if (req.body.price !== undefined) {
      const price = num(req.body.price);
      if (Number.isNaN(price) || price < 0) return res.status(400).json({ message: "Enter a valid selling price" });
      product.price = roundUSD(price);
    }
    if (req.body.costPrice !== undefined && req.body.costPrice !== "") {
      const costPrice = num(req.body.costPrice);
      if (Number.isNaN(costPrice) || costPrice < 0) return res.status(400).json({ message: "Enter a valid cost price" });
      product.costPrice = roundUSD(costPrice);
    }
    if (req.body.lowStockAlert !== undefined && req.body.lowStockAlert !== "") {
      const v = num(req.body.lowStockAlert);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ message: "Enter a valid low-stock alert level" });
      product.lowStockAlert = v;
    }
    let stockDelta = 0;
    if (req.body.stock !== undefined) {
      const stock = num(req.body.stock);
      if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        return res.status(400).json({ message: "Enter a valid stock quantity" });
      }
      stockDelta = stock - product.stock;
      product.stock = stock;
    }
    if (req.body.unit !== undefined) {
      const unit = String(req.body.unit).trim();
      if (unit) product.unit = unit;
    }

    if (req.files?.image?.[0]) {
      const oldPublicId = product.imagePublicId;
      const { url, publicId } = await uploadBufferToCloudinary(req.files.image[0].buffer, {
        folder: "athlete-verify/products",
        resourceType: "image",
      });
      product.imageUrl = url;
      product.imagePublicId = publicId;
      if (oldPublicId) {
        cloudinary.uploader
          .destroy(oldPublicId)
          .catch((err) => console.warn("Old product photo cleanup failed:", err.message));
      }
    }

    await product.save();

    if (stockDelta !== 0) {
      await StockMovement.create({
        product: product._id,
        productName: product.name,
        type: "ADJUST",
        quantity: stockDelta,
        unitCost: product.costPrice || 0,
        note: req.body.note ? String(req.body.note).trim() : "Manual stock adjustment",
        createdBy: req.adminId,
      });
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/products/:id (admin). Movement history is kept (each row
// carries productName), so past sales and profit stay in the report.
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (product.imagePublicId) {
      cloudinary.uploader
        .destroy(product.imagePublicId)
        .catch((err) => console.warn("Product photo cleanup failed:", err.message));
    }
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------------------------------------------------------
// Stock movements (purchases in / sales out / adjustments)
// ---------------------------------------------------------------------------

// POST /api/products/movements (admin, JSON)
//   { productId, type: "IN"|"OUT"|"ADJUST", quantity, unitPrice?, party?, note?, date? }
//   IN:     unitPrice = buying cost per unit (default: current cost price)
//   OUT:    unitPrice = selling price per unit (default: current price)
//   ADJUST: quantity may be negative; no money involved
exports.createMovement = async (req, res) => {
  try {
    const { productId, type } = req.body;
    if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: "Choose a product" });
    if (!["IN", "OUT", "ADJUST"].includes(type)) return res.status(400).json({ message: "Invalid movement type" });

    const quantity = num(req.body.quantity);
    if (Number.isNaN(quantity) || !Number.isInteger(quantity) || quantity === 0) {
      return res.status(400).json({ message: "Enter a valid whole-number quantity" });
    }
    if (type !== "ADJUST" && quantity < 0) {
      return res.status(400).json({ message: "Quantity must be greater than 0" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const base = {
      product: product._id,
      productName: product.name,
      type,
      quantity,
      party: (req.body.party || "").trim(),
      note: (req.body.note || "").trim(),
      date: movementDate(req.body.date),
      createdBy: req.adminId,
    };
    let movement;

    if (type === "IN") {
      const unitCost = roundUSD(num(req.body.unitPrice, product.costPrice || 0));
      if (Number.isNaN(unitCost) || unitCost < 0) return res.status(400).json({ message: "Enter a valid buying price" });
      // Weighted average cost: old stock at old cost + new stock at new cost.
      const newStock = product.stock + quantity;
      const avg = newStock > 0 ? (product.stock * (product.costPrice || 0) + quantity * unitCost) / newStock : unitCost;
      product.stock = newStock;
      product.costPrice = roundUSD(avg);
      movement = { ...base, unitPrice: unitCost, unitCost, totalAmount: roundUSD(quantity * unitCost) };
    } else if (type === "OUT") {
      if (quantity > product.stock) {
        return res.status(400).json({ message: `Not enough stock — only ${product.stock} ${product.unit} left` });
      }
      const unitPrice = roundUSD(num(req.body.unitPrice, product.price));
      if (Number.isNaN(unitPrice) || unitPrice < 0) return res.status(400).json({ message: "Enter a valid selling price" });
      const unitCost = product.costPrice || 0;
      product.stock -= quantity;
      movement = {
        ...base,
        unitPrice,
        unitCost,
        totalAmount: roundUSD(quantity * unitPrice),
        profit: roundUSD(quantity * (unitPrice - unitCost)),
      };
    } else {
      if (product.stock + quantity < 0) {
        return res.status(400).json({ message: `Can't remove more than the ${product.stock} in stock` });
      }
      product.stock += quantity;
      movement = { ...base, unitCost: product.costPrice || 0 };
    }

    await product.save();
    const saved = await StockMovement.create(movement);
    res.status(201).json({ movement: saved, product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/products/movements?type=&productId=&from=&to=&limit=
exports.listMovements = async (req, res) => {
  try {
    const filter = {};
    if (["IN", "OUT", "ADJUST"].includes(req.query.type)) filter.type = req.query.type;
    if (mongoose.isValidObjectId(req.query.productId)) filter.product = req.query.productId;
    const from = parseDay(req.query.from);
    const to = parseDay(req.query.to, true);
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const rows = await StockMovement.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .populate("createdBy", "username");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/products/movements/:id — undo a mistaken entry. The product's
// stock (and, for a purchase, its average cost) is rolled back.
exports.deleteMovement = async (req, res) => {
  try {
    const m = await StockMovement.findById(req.params.id);
    if (!m) return res.status(404).json({ message: "Record not found" });
    const product = await Product.findById(m.product);

    if (product) {
      if (m.type === "IN") {
        if (product.stock < m.quantity) {
          return res.status(400).json({
            message: "Can't undo this purchase — some of that stock has already been sold. Undo those sales first or use an adjustment.",
          });
        }
        const newStock = product.stock - m.quantity;
        // Undoing the product's most recent movement is an exact reverse of
        // the average-cost blend. If other entries came after it, the
        // average is left as it is (pulling one purchase out of a mixed
        // pool would distort the cost of what's still on the shelf).
        const laterExists = await StockMovement.exists({
          product: m.product,
          _id: { $ne: m._id },
          createdAt: { $gt: m.createdAt },
        });
        if (newStock > 0 && !laterExists) {
          const avg = (product.stock * (product.costPrice || 0) - m.quantity * m.unitCost) / newStock;
          product.costPrice = roundUSD(Math.max(avg, 0));
        }
        product.stock = newStock;
      } else if (m.type === "OUT") {
        product.stock += m.quantity;
      } else {
        if (product.stock - m.quantity < 0) {
          return res.status(400).json({ message: "Can't undo — stock would go below zero" });
        }
        product.stock -= m.quantity;
      }
      await product.save();
    }

    await m.deleteOne();
    res.json({ message: "Record deleted", product });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------------------------------------------------------
// Report / analysis
// ---------------------------------------------------------------------------

// GET /api/products/report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Default range: the last 30 days. Returns totals, a per-day series, a
// per-product breakdown, and the current stock position.
exports.report = async (req, res) => {
  try {
    let to = parseDay(req.query.to, true);
    let from = parseDay(req.query.from);
    if (!to) to = new Date();
    if (!from) from = new Date(to.getTime() - 29 * 24 * 3600 * 1000);
    const match = { date: { $gte: from, $lte: to } };

    const [totalsAgg, daily, byProduct, products] = await Promise.all([
      StockMovement.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$type",
            qty: { $sum: "$quantity" },
            amount: { $sum: "$totalAmount" },
            profit: { $sum: "$profit" },
            count: { $sum: 1 },
          },
        },
      ]),
      StockMovement.aggregate([
        { $match: { ...match, type: { $in: ["IN", "OUT"] } } },
        {
          $group: {
            _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: TZ } }, type: "$type" },
            amount: { $sum: "$totalAmount" },
            profit: { $sum: "$profit" },
          },
        },
        { $sort: { "_id.day": 1 } },
      ]),
      StockMovement.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$product",
            name: { $last: "$productName" },
            qtyIn: { $sum: { $cond: [{ $eq: ["$type", "IN"] }, "$quantity", 0] } },
            purchaseAmount: { $sum: { $cond: [{ $eq: ["$type", "IN"] }, "$totalAmount", 0] } },
            qtySold: { $sum: { $cond: [{ $eq: ["$type", "OUT"] }, "$quantity", 0] } },
            revenue: { $sum: { $cond: [{ $eq: ["$type", "OUT"] }, "$totalAmount", 0] } },
            profit: { $sum: "$profit" },
            adjusted: { $sum: { $cond: [{ $eq: ["$type", "ADJUST"] }, "$quantity", 0] } },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      Product.find().select("name stock costPrice price unit lowStockAlert").sort({ name: 1 }).lean(),
    ]);

    const t = Object.fromEntries(totalsAgg.map((r) => [r._id, r]));
    const revenue = t.OUT?.amount || 0;
    const profit = t.OUT?.profit || 0;
    const cogs = revenue - profit;

    // Fill every day in the range so the chart has no gaps.
    const dayMap = {};
    daily.forEach((r) => {
      const d = (dayMap[r._id.day] = dayMap[r._id.day] || { day: r._id.day, purchases: 0, sales: 0, profit: 0 });
      if (r._id.type === "IN") d.purchases += r.amount;
      else {
        d.sales += r.amount;
        d.profit += r.profit;
      }
    });
    const series = [];
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
    const lastDay = fmt.format(to);
    for (let cur = new Date(from.getTime()); ; cur = new Date(cur.getTime() + 24 * 3600 * 1000)) {
      const key = fmt.format(cur);
      series.push(dayMap[key] || { day: key, purchases: 0, sales: 0, profit: 0 });
      if (key >= lastDay || series.length > 400) break;
    }

    const stockValueCost = products.reduce((s, p) => s + p.stock * (p.costPrice || 0), 0);
    const stockValueRetail = products.reduce((s, p) => s + p.stock * (p.price || 0), 0);
    const lowStock = products.filter((p) => p.stock <= (p.lowStockAlert ?? 5));

    const productRows = byProduct.map((r) => ({
      ...r,
      margin: r.revenue > 0 ? Math.round((r.profit / r.revenue) * 1000) / 10 : 0,
    }));

    res.json({
      range: { from, to },
      totals: {
        purchases: t.IN?.amount || 0,
        qtyPurchased: t.IN?.qty || 0,
        revenue,
        qtySold: t.OUT?.qty || 0,
        salesCount: t.OUT?.count || 0,
        cogs,
        profit,
        margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
        adjustments: t.ADJUST?.qty || 0,
      },
      stock: {
        productCount: products.length,
        totalUnits: products.reduce((s, p) => s + p.stock, 0),
        valueAtCost: roundUSD(stockValueCost),
        valueAtRetail: roundUSD(stockValueRetail),
        potentialProfit: roundUSD(stockValueRetail - stockValueCost),
        lowStock,
      },
      series,
      byProduct: productRows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
