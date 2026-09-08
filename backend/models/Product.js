const mongoose = require("mongoose");

// A sports-equipment item sold through the admin shop/inventory page —
// name, price, and how many are in stock. Stock is adjusted directly
// (± steppers or a full edit) rather than tracked via order history, since
// there's no checkout flow yet.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, trim: true, default: "pcs" },
    imageUrl: { type: String },
    imagePublicId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
