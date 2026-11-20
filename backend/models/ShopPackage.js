const mongoose = require("mongoose");

// A ready-made bundle sold as one deal — e.g. "Tournament package":
// 1 trophy + 15 medals (from stock) + referee fee + fixture-table fee
// (services, typed by hand).
//
//   items[].product set   → stock item: selling the package cuts its stock
//   items[].product null  → service/fee line: no stock involved
//   price                 → the package price; if it's lower than the sum of
//                           the items, the difference is given as a discount
//                           on the invoice. null = just the sum of the items.
//   isPublic              → also show it on the public /shop page
const packageItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    name: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const shopPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    items: { type: [packageItemSchema], default: [] },
    price: { type: Number, min: 0, default: null },
    isPublic: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShopPackage", shopPackageSchema);
