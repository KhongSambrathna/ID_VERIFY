const mongoose = require("mongoose");

// A purchase being considered (or already ordered) from a supplier — used
// to work out costs and expected profit BEFORE deciding to buy.
//
// Each line is either an existing product (product set) or a new item not in
// the shop yet (product null, name typed in). Shipping and other costs are
// spread over the lines in proportion to their value to get the real
// ("landed") cost per unit. When the goods arrive, "Receive" puts every line
// into stock as a purchase (new items become new products).
const planItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    name: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "pcs" },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    expectedSellPrice: { type: Number, min: 0, default: 0 },
  },
  { _id: true }
);

const purchasePlanSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    supplier: {
      name: { type: String, trim: true, default: "" },
      phone: { type: String, trim: true, default: "" },
    },
    orderDate: { type: Date, default: null },
    expectedDelivery: { type: Date, default: null },
    status: { type: String, enum: ["draft", "ordered", "received", "cancelled"], default: "draft" },
    items: { type: [planItemSchema], default: [] },
    shippingCost: { type: Number, min: 0, default: 0 },
    otherCost: { type: Number, min: 0, default: 0 },
    otherCostNote: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    receivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PurchasePlan", purchasePlanSchema);
