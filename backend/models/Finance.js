const mongoose = require("mongoose");

// Personal money tracking for the Admin (separate from the shop):
//   FinanceTxn  — one income or expense on a day (salary, food, fuel…)
//   FinanceDebt — money I owe someone ("owe") or someone owes me ("lend"),
//                 with its repayments
//   FinancePlan — expected monthly income / expense (salary, rent, loan
//                 instalment…) to compare plan vs actual each month
// Every record belongs to the Admin account that made it (owner) — other
// Admins never see it. Amounts can be in USD or Riel; amountUSD is the
// dollar value used for totals (៛4,000 = $1, see utils/currency).
const ref = { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, index: true };
const money = {
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ["USD", "KHR"], default: "USD" },
  amountUSD: { type: Number, default: 0 },
};

const txnSchema = new mongoose.Schema(
  {
    owner: ref,
    type: { type: String, enum: ["income", "expense"], required: true },
    ...money,
    category: { type: String, trim: true, default: "other" },
    method: { type: String, trim: true, default: "cash" }, // cash | bank | other
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    debt: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceDebt", default: null },
  },
  { timestamps: true }
);
txnSchema.index({ owner: 1, date: -1 });

const paymentSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    ...money,
    note: { type: String, trim: true, default: "" },
    txn: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceTxn", default: null },
  },
  { _id: true }
);

const debtSchema = new mongoose.Schema(
  {
    owner: ref,
    direction: { type: String, enum: ["owe", "lend"], default: "owe" },
    party: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    ...money,
    interestRate: { type: Number, min: 0, default: 0 }, // % per month
    monthlyPayment: { type: Number, min: 0, default: 0 }, // in the debt's currency
    paymentDay: { type: Number, min: 0, max: 31, default: 0 }, // day of month, 0 = none
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    note: { type: String, trim: true, default: "" },
    payments: { type: [paymentSchema], default: [] },
    closed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const planSchema = new mongoose.Schema(
  {
    owner: ref,
    kind: { type: String, enum: ["income", "expense"], required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "other" },
    ...money, // amount each time
    timesPerMonth: { type: Number, min: 0, default: 1 }, // e.g. salary paid twice a month = 2
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = {
  FinanceTxn: mongoose.model("FinanceTxn", txnSchema),
  FinanceDebt: mongoose.model("FinanceDebt", debtSchema),
  FinancePlan: mongoose.model("FinancePlan", planSchema),
};
