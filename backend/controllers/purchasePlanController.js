const mongoose = require("mongoose");
const PurchasePlan = require("../models/PurchasePlan");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const { roundUSD } = require("../utils/currency");

const TZ_OFFSET = "+07:00";

function num(v, fallback = NaN) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function day(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T12:00:00${TZ_OFFSET}`);
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Works out the money side of a plan. Shipping + other costs are shared
// over the lines by value, giving a landed cost per unit.
function calc(plan, productsById = {}) {
  const p = plan.toObject ? plan.toObject() : plan;
  const goods = p.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
  const extra = (p.shippingCost || 0) + (p.otherCost || 0);
  const items = p.items.map((it) => {
    const prod = it.product ? productsById[String(it.product)] : null;
    const lineGoods = it.quantity * it.unitCost;
    const share = goods > 0 ? (extra * lineGoods) / goods : it.quantity > 0 ? extra / p.items.length : 0;
    const landedUnit = it.quantity > 0 ? (lineGoods + share) / it.quantity : 0;
    const revenue = it.quantity * (it.expectedSellPrice || 0);
    const cost = lineGoods + share;
    return {
      ...it,
      name: prod ? prod.name : it.name,
      imageUrl: prod ? prod.imageUrl : null,
      currentStock: prod ? prod.stock : null,
      currentCost: prod ? prod.costPrice : null,
      currentPrice: prod ? prod.price : null,
      lineGoods: roundUSD(lineGoods),
      landedUnitCost: roundUSD(landedUnit),
      expectedRevenue: roundUSD(revenue),
      expectedProfit: roundUSD(revenue - cost),
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
    };
  });
  const totalCost = goods + extra;
  const revenue = items.reduce((s, i) => s + i.expectedRevenue, 0);
  return {
    ...p,
    items,
    totals: {
      goods: roundUSD(goods),
      extra: roundUSD(extra),
      totalCost: roundUSD(totalCost),
      expectedRevenue: roundUSD(revenue),
      expectedProfit: roundUSD(revenue - totalCost),
      margin: revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10 : 0,
      roi: totalCost > 0 ? Math.round(((revenue - totalCost) / totalCost) * 1000) / 10 : 0,
      units: items.reduce((s, i) => s + i.quantity, 0),
    },
  };
}

async function withProducts(plans) {
  const ids = [...new Set(plans.flatMap((p) => p.items.filter((i) => i.product).map((i) => String(i.product))))];
  const prods = await Product.find({ _id: { $in: ids } }).select("name unit stock costPrice price imageUrl").lean();
  const byId = Object.fromEntries(prods.map((p) => [String(p._id), p]));
  return plans.map((p) => calc(p, byId));
}

function parseBody(plan, body) {
  if (body.title !== undefined) plan.title = String(body.title).trim();
  if (body.supplier) {
    plan.supplier = {
      name: String(body.supplier.name || "").trim(),
      phone: String(body.supplier.phone || "").trim(),
    };
  }
  if (body.orderDate !== undefined) plan.orderDate = day(body.orderDate);
  if (body.expectedDelivery !== undefined) plan.expectedDelivery = day(body.expectedDelivery);
  if (body.status !== undefined) {
    if (!["draft", "ordered", "cancelled"].includes(body.status) && body.status !== plan.status) {
      return "Use the Receive button to mark goods as received";
    }
    plan.status = body.status;
  }
  for (const k of ["shippingCost", "otherCost"]) {
    if (body[k] === undefined) continue;
    const v = num(body[k], 0);
    if (Number.isNaN(v) || v < 0) return "Enter valid extra costs";
    plan[k] = roundUSD(v);
  }
  if (body.otherCostNote !== undefined) plan.otherCostNote = String(body.otherCostNote).trim();
  if (body.note !== undefined) plan.note = String(body.note).trim();
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length === 0) return "Add at least one item";
    const items = [];
    for (const [i, it] of body.items.entries()) {
      const qty = num(it.quantity);
      const cost = num(it.unitCost);
      const sell = num(it.expectedSellPrice, 0);
      if (Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) return `Line ${i + 1}: enter a whole-number quantity`;
      if (Number.isNaN(cost) || cost < 0) return `Line ${i + 1}: enter the buying price`;
      if (Number.isNaN(sell) || sell < 0) return `Line ${i + 1}: enter a valid selling price`;
      if (it.productId) {
        if (!mongoose.isValidObjectId(it.productId)) return `Line ${i + 1}: invalid product`;
        items.push({ product: it.productId, name: "", unit: "", quantity: qty, unitCost: roundUSD(cost), expectedSellPrice: roundUSD(sell) });
      } else {
        const name = String(it.name || "").trim();
        if (!name) return `Line ${i + 1}: enter the item name`;
        items.push({
          product: null,
          name,
          unit: String(it.unit || "pcs").trim() || "pcs",
          quantity: qty,
          unitCost: roundUSD(cost),
          expectedSellPrice: roundUSD(sell),
        });
      }
    }
    plan.items = items;
  }
  if (!plan.title) return "Enter a title for the plan";
  return null;
}

// GET /api/purchase-plans
exports.listPlans = async (req, res) => {
  try {
    const plans = await PurchasePlan.find().sort({ status: 1, expectedDelivery: 1, createdAt: -1 }).limit(300);
    res.json(await withProducts(plans));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/purchase-plans/:id
exports.getPlan = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Plan not found" });
    const plan = await PurchasePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json((await withProducts([plan]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/purchase-plans
exports.createPlan = async (req, res) => {
  try {
    const plan = new PurchasePlan({ title: "", createdBy: req.adminId });
    const err = parseBody(plan, { items: [], ...req.body, status: req.body.status || "draft" });
    if (err) return res.status(400).json({ message: err });
    await plan.save();
    res.status(201).json((await withProducts([plan]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/purchase-plans/:id — received plans are locked.
exports.updatePlan = async (req, res) => {
  try {
    const plan = await PurchasePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (plan.status === "received") return res.status(400).json({ message: "This plan was already received into stock" });
    const err = parseBody(plan, req.body);
    if (err) return res.status(400).json({ message: err });
    await plan.save();
    res.json((await withProducts([plan]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/purchase-plans/:id — removes the plan only (stock already
// received stays; undo those from the stock history if needed).
exports.deletePlan = async (req, res) => {
  try {
    const plan = await PurchasePlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json({ message: "Plan deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/purchase-plans/:id/receive  { date? }
// The goods arrived: each line goes into stock as a purchase at its landed
// cost (shipping included). New items are created as products (no photo
// yet — add one later on the Products tab).
exports.receivePlan = async (req, res) => {
  try {
    const plan = await PurchasePlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (plan.status === "received") return res.status(400).json({ message: "Already received" });
    if (plan.status === "cancelled") return res.status(400).json({ message: "This plan is cancelled" });
    const computed = calc(plan);
    const date = day(req.body?.date) || new Date();
    const note = `Purchase plan: ${plan.title}`;

    for (let i = 0; i < plan.items.length; i++) {
      const it = plan.items[i];
      const landed = computed.items[i].landedUnitCost;
      let product = it.product ? await Product.findById(it.product) : null;
      if (!product) {
        product = await Product.create({
          name: it.name || computed.items[i].name || "New item",
          price: it.expectedSellPrice || 0,
          costPrice: 0,
          stock: 0,
          unit: it.unit || "pcs",
        });
        plan.items[i].product = product._id;
      }
      const newStock = product.stock + it.quantity;
      product.costPrice = roundUSD(
        newStock > 0 ? (product.stock * (product.costPrice || 0) + it.quantity * landed) / newStock : landed
      );
      product.stock = newStock;
      await product.save();
      await StockMovement.create({
        product: product._id,
        productName: product.name,
        type: "IN",
        quantity: it.quantity,
        unitPrice: landed,
        unitCost: landed,
        totalAmount: roundUSD(it.quantity * landed),
        party: plan.supplier?.name || "",
        note,
        date,
        createdBy: req.adminId,
      });
    }
    plan.status = "received";
    plan.receivedAt = date;
    await plan.save();
    res.json((await withProducts([plan]))[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
