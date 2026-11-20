const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");
const Counter = require("../models/Counter");
const { roundUSD } = require("../utils/currency");

const TZ_OFFSET = "+07:00";

function num(v, fallback = NaN) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Invoice date from the form ("2026-11-20") at local noon; else now.
function invoiceDate(str) {
  if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T12:00:00${TZ_OFFSET}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

// "INV-2026-0001" — a separate running number for each year.
async function nextInvoiceNo(date) {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric" }).format(date);
  const c = await Counter.findOneAndUpdate(
    { name: `invoice-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `INV-${year}-${String(c.seq).padStart(4, "0")}`;
}

async function nextQuoteNo(date) {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric" }).format(date);
  const c = await Counter.findOneAndUpdate({ name: `quote-${year}` }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `QT-${year}-${String(c.seq).padStart(4, "0")}`;
}

// Cuts stock for every stock line of a (non-planned) invoice and records a
// sale linked to it. The invoice discount is spread over the lines, so the
// profit in the shop report matches what was really charged.
async function cutStock(invoice, adminId) {
  const discountRatio = invoice.subtotal > 0 ? invoice.total / invoice.subtotal : 1;
  for (const item of invoice.items) {
    if (!item.product) continue;
    const product = await Product.findById(item.product);
    if (!product) continue;
    const unitCost = product.costPrice || 0;
    const netUnit = roundUSD(item.unitPrice * discountRatio);
    product.stock -= item.quantity;
    await product.save();
    const m = await StockMovement.create({
      product: product._id,
      productName: product.name,
      type: "OUT",
      quantity: item.quantity,
      unitPrice: netUnit,
      unitCost,
      totalAmount: roundUSD(item.quantity * netUnit),
      profit: roundUSD(item.quantity * (netUnit - unitCost)),
      party: invoice.customer.name,
      note: `Invoice ${invoice.invoiceNo}`,
      date: invoice.date,
      invoice: invoice._id,
      createdBy: adminId,
    });
    item.movement = m._id;
  }
}

// Gives every line its stock back and deletes its stock-out record.
async function returnStock(invoice) {
  for (const item of invoice.items) {
    if (!item.product || !item.movement) continue;
    const m = await StockMovement.findById(item.movement);
    if (m) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stock += m.quantity;
        await product.save();
      }
      await m.deleteOne();
    }
    item.movement = null;
  }
  require("../utils/telegramAlerts").stockChanged(invoice.items.filter((i) => i.product).map((i) => i.product));
}

// GET /api/invoices?q=&status=&from=&to=
exports.listInvoices = async (req, res) => {
  try {
    const filter = {};
    const q = String(req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ invoiceNo: rx }, { "customer.name": rx }, { "customer.phone": rx }];
    }
    const rows = await Invoice.find(filter).sort({ date: -1, createdAt: -1 }).limit(500);
    const status = req.query.status;
    res.json(status ? rows.filter((r) => r.status === status) : rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/invoices/:id
exports.getInvoice = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Invoice not found" });
    const inv = await Invoice.findById(req.params.id).populate("createdBy", "username");
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    res.json(inv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/invoices
// body: { date?, language?, customer: { name, phone, address }, discount?,
//         paidAmount?, note?,
//         items: [{ productId?, name?, quantity, unitPrice }] }
// Lines with productId are stock lines (stock is cut automatically);
// lines without are manual lines (name required, stock untouched).
exports.createInvoice = async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ message: "Add at least one item" });

    // 1) Validate every line and check stock BEFORE changing anything.
    const items = [];
    const needByProduct = new Map();
    for (const [i, it] of rawItems.entries()) {
      const qty = num(it.quantity);
      const price = num(it.unitPrice);
      if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ message: `Line ${i + 1}: enter a quantity` });
      if (Number.isNaN(price) || price < 0) return res.status(400).json({ message: `Line ${i + 1}: enter a valid price` });

      if (it.productId) {
        if (!mongoose.isValidObjectId(it.productId)) return res.status(400).json({ message: `Line ${i + 1}: invalid product` });
        if (!Number.isInteger(qty)) return res.status(400).json({ message: `Line ${i + 1}: stock items need a whole-number quantity` });
        const product = await Product.findById(it.productId);
        if (!product) return res.status(404).json({ message: `Line ${i + 1}: product not found` });
        needByProduct.set(String(product._id), (needByProduct.get(String(product._id)) || 0) + qty);
        items.push({
          product,
          group: String(it.group || "").trim(),
          name: (it.name || "").trim() || product.name,
          unit: product.unit || "pcs",
          quantity: qty,
          unitPrice: roundUSD(price),
          listPrice: product.price > roundUSD(price) ? product.price : null,
        });
      } else {
        const name = String(it.name || "").trim();
        if (!name) return res.status(400).json({ message: `Line ${i + 1}: enter a description` });
        items.push({
          product: null,
          group: String(it.group || "").trim(),
          name,
          unit: String(it.unit || "").trim(),
          quantity: qty,
          unitPrice: roundUSD(price),
        });
      }
    }
    const planned = Boolean(req.body.planned);
    for (const it of items) {
      if (!it.product || planned) continue;
      const need = needByProduct.get(String(it.product._id));
      if (need > it.product.stock) {
        return res.status(400).json({
          message: `Not enough stock for "${it.product.name}" — only ${it.product.stock} ${it.product.unit || "pcs"} left`,
        });
      }
    }

    const subtotal = roundUSD(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
    const discount = roundUSD(Math.min(Math.max(num(req.body.discount, 0) || 0, 0), subtotal));
    const total = roundUSD(subtotal - discount);
    let paidAmount = num(req.body.paidAmount, 0);
    if (Number.isNaN(paidAmount) || paidAmount < 0) paidAmount = 0;
    paidAmount = roundUSD(Math.min(paidAmount, total));

    const date = invoiceDate(req.body.date);
    const invoiceNo = planned ? await nextQuoteNo(date) : await nextInvoiceNo(date);
    const customer = req.body.customer || {};

    const invoice = new Invoice({
      invoiceNo,
      date,
      language: req.body.language === "en" ? "en" : "km",
      customerType: req.body.customerType === "wholesale" ? "wholesale" : "retail",
      customer: {
        name: String(customer.name || "").trim(),
        phone: String(customer.phone || "").trim(),
        address: String(customer.address || "").trim(),
      },
      items: items.map((it) => ({
        product: it.product ? it.product._id : null,
        group: it.group,
        listPrice: it.listPrice || null,
        name: it.name,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: roundUSD(it.quantity * it.unitPrice),
      })),
      subtotal,
      discount,
      total,
      paidAmount,
      note: String(req.body.note || "").trim(),
      createdBy: req.adminId,
      planned,
      expectedDate: planned ? invoiceDate(req.body.expectedDate || req.body.date) : null,
    });

    // 2) Cut stock (not for a planned sale — that happens when it's sold).
    if (!planned) await cutStock(invoice, req.adminId);

    await invoice.save();
    if (!planned) require("../utils/telegramAlerts").stockChanged(items.filter((it) => it.product).map((it) => it.product._id));
    res.status(201).json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/invoices/:id  body: { paidAmount?, customer?, note?, language? }
// Payment and customer details can change later; the lines can't (void the
// invoice and make a new one instead, so stock always stays correct).
exports.updateInvoice = async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    if (req.body.paidAmount !== undefined) {
      const p = num(req.body.paidAmount);
      if (Number.isNaN(p) || p < 0) return res.status(400).json({ message: "Enter a valid amount" });
      inv.paidAmount = roundUSD(Math.min(p, inv.total));
    }
    if (req.body.customer) {
      ["name", "phone", "address"].forEach((k) => {
        if (req.body.customer[k] !== undefined) inv.customer[k] = String(req.body.customer[k]).trim();
      });
    }
    if (req.body.note !== undefined) inv.note = String(req.body.note).trim();
    if (req.body.language === "km" || req.body.language === "en") inv.language = req.body.language;
    if (inv.planned && req.body.expectedDate !== undefined) inv.expectedDate = invoiceDate(req.body.expectedDate);
    await inv.save();
    res.json(inv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/invoices/:id/void — cancel: stock lines go back on the shelf,
// the sale disappears from the report, the invoice stays marked "VOID".
exports.voidInvoice = async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    if (inv.voided) return res.json(inv);
    await returnStock(inv);
    inv.voided = true;
    inv.voidedAt = new Date();
    await inv.save();
    res.json(inv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/invoices/:id — remove completely (stock is returned first).
exports.deleteInvoice = async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    await returnStock(inv);
    await inv.deleteOne();
    res.json({ message: "Invoice deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/invoices/:id/finalize  { date?, paidAmount? }
// A planned sale happened: give it a real invoice number, cut the stock.
exports.finalizeInvoice = async (req, res) => {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    if (!inv.planned) return res.status(400).json({ message: "This invoice is already a real sale" });
    if (inv.voided) return res.status(400).json({ message: "This invoice is void" });
    const need = new Map();
    for (const it of inv.items) if (it.product) need.set(String(it.product), (need.get(String(it.product)) || 0) + it.quantity);
    for (const [id, qty] of need) {
      const p = await Product.findById(id);
      if (!p) return res.status(400).json({ message: "A product on this invoice no longer exists" });
      if (qty > p.stock) return res.status(400).json({ message: `Not enough stock for "${p.name}" — only ${p.stock} ${p.unit || "pcs"} left` });
    }
    const quoteNo = inv.invoiceNo;
    inv.date = invoiceDate(req.body.date);
    inv.invoiceNo = await nextInvoiceNo(inv.date);
    inv.planned = false;
    inv.note = [inv.note, `(${quoteNo})`].filter(Boolean).join(" ");
    if (req.body.paidAmount !== undefined) {
      const p = num(req.body.paidAmount);
      if (!Number.isNaN(p) && p >= 0) inv.paidAmount = roundUSD(Math.min(p, inv.total));
    }
    await cutStock(inv, req.adminId);
    await inv.save();
    require("../utils/telegramAlerts").stockChanged([...need.keys()]);
    res.json(inv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
