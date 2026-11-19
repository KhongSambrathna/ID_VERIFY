const mongoose = require("mongoose");

// A sports-equipment item sold through the admin shop/inventory page.
//
//   price     — the SELLING price (what a buyer pays, shown on /shop)
//   costPrice — the BUYING cost per unit, kept as a weighted average of
//               every stock-in (purchase) so profit stays correct even when
//               the supplier price changes between restocks
//   stock     — current quantity on hand
//
// Every change to stock (purchase in, sale out, manual adjustment) is
// recorded as a StockMovement row, so the report page can show purchases,
// sales, revenue and profit for any date range.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0, default: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, trim: true, default: "pcs" },
    // Stock at or below this number is flagged "low stock".
    lowStockAlert: { type: Number, min: 0, default: 5 },
    imageUrl: { type: String },
    imagePublicId: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
