const mongoose = require("mongoose");

// One row per change to a product's stock.
//
//   IN     — purchase / restock. unitPrice = buying cost per unit.
//   OUT    — sale. unitPrice = selling price per unit actually charged;
//            unitCost = the product's average cost at the moment of sale,
//            so profit = (unitPrice - unitCost) * quantity is frozen in
//            and never changes when later purchases move the average.
//   ADJUST — manual correction (count fix, damaged, lost, gift…).
//            quantity is signed (+ adds stock, − removes it); no money.
//
// productName is copied in so history still reads correctly after a
// product is renamed or deleted.
const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    type: { type: String, enum: ["IN", "OUT", "ADJUST"], required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    // Supplier (for IN) or customer (for OUT) — free text, optional.
    party: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

stockMovementSchema.index({ date: -1 });
stockMovementSchema.index({ product: 1, date: -1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
