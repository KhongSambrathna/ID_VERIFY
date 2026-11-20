const mongoose = require("mongoose");

// A sales invoice from the shop (BRATHNA SPORT SHOP).
//
// Each line is one of two kinds:
//   • stock line  (product set)   — an item from the inventory. Saving the
//     invoice automatically records a sale (StockMovement OUT) for it, so
//     stock goes down and profit is counted in the shop report.
//   • manual line (product null)  — anything typed in by hand (printing a
//     name on a shirt, delivery, a service…). No effect on stock.
//
// Money is in US dollars, like the rest of the shop.
const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: "" },
    // Package name when this line came from a package (printed as a group).
    group: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    // Normal selling price at the time — when higher than unitPrice the
    // invoice shows it crossed out (product discount or wholesale price).
    listPrice: { type: Number, default: null },
    total: { type: Number, required: true },
    // The stock-out record created for this line (stock lines only).
    movement: { type: mongoose.Schema.Types.ObjectId, ref: "StockMovement", default: null },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    // "INV-2026-0001" — numbered per year, never reused.
    invoiceNo: { type: String, required: true, unique: true },
    date: { type: Date, default: Date.now },
    // "wholesale" customers get each product's wholesale price.
    customerType: { type: String, enum: ["retail", "wholesale"], default: "retail" },
    customer: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
      address: { type: String, trim: true, default: "" },
    },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    // Language the invoice was written in (the print view can still switch).
    language: { type: String, enum: ["km", "en"], default: "km" },
    note: { type: String, trim: true, default: "" },
    // Cancelled invoices stay on record (number isn't reused) but their
    // stock lines are returned to the shelf and they're left out of totals.
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

invoiceSchema.index({ date: -1 });

invoiceSchema.virtual("status").get(function () {
  if (this.voided) return "VOID";
  if (this.paidAmount >= this.total - 0.001) return "PAID";
  if (this.paidAmount > 0) return "PARTIAL";
  return "UNPAID";
});
invoiceSchema.set("toJSON", { virtuals: true });
invoiceSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
