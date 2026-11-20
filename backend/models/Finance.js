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
    // Which money account it went into / came out of (cash, ABA, ACLEDA…).
    account: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceAccount", default: null },
  },
  { timestamps: true }
);
txnSchema.index({ owner: 1, date: -1 });

const paymentSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    ...money,
    // How much of this payment was interest — the rest pays down the debt.
    interest: { type: Number, min: 0, default: 0 },
    auto: { type: Boolean, default: false }, // recorded automatically after the pay day passed
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
    // How it's paid back:
    //   fixed         — a set amount each month (interest first, rest off the debt)
    //   interest_only — pay just the interest each month; the full amount is
    //                   repaid in one go at the end (or whenever)
    //   flexible      — informal (friends/family): pay whatever, whenever,
    //                   usually no interest
    repayType: { type: String, enum: ["fixed", "interest_only", "flexible"], default: "fixed" },
    interestRate: { type: Number, min: 0, default: 0 }, // % per month
    monthlyPayment: { type: Number, min: 0, default: 0 }, // in the debt's currency
    paymentDay: { type: Number, min: 0, max: 31, default: 0 }, // day of month, 0 = none
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    note: { type: String, trim: true, default: "" },
    payments: { type: [paymentSchema], default: [] },
    // Auto-pay (fixed / interest-only debts I owe): once the pay day has
    // passed, the month's payment is recorded as paid automatically.
    autoPay: { type: Boolean, default: true },
    autoFrom: { type: Date, default: null }, // only months due after this
    autoDoneThrough: { type: String, default: "" }, // last month handled, "YYYY-MM"
    payAccount: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceAccount", default: null },
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
    // income: sure (salary) vs. hoped-for (sales, services, tournaments)
    sure: { type: Boolean, default: true },
    // expense: essential (food, fuel, phone…) vs. can be cut if money is short
    essential: { type: Boolean, default: true },
    note: { type: String, trim: true, default: "" },
    // One-time (e.g. selling something once): counted only in `month`.
    oneTime: { type: Boolean, default: false },
    month: { type: String, default: "" }, // "YYYY-MM"
    done: { type: Boolean, default: false }, // one-time: already received / paid
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Where my money is: cash in hand, each bank account, e-wallets…
// Current balance = openingBalance (counted on openingDate) + income − expenses
// recorded on this account since then. "Update balance" just sets a fresh
// openingBalance/openingDate to the real amount.
const accountSchema = new mongoose.Schema(
  {
    owner: ref,
    name: { type: String, required: true, trim: true }, // e.g. "ABA", "ACLEDA", "Cash"
    kind: { type: String, enum: ["cash", "bank", "wallet", "other"], default: "bank" },
    currency: { type: String, enum: ["USD", "KHR"], default: "USD" },
    openingBalance: { type: Number, default: 0 },
    openingDate: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: "" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Per-Admin finance settings — which teams' student fee debts count as
// "owed to me" (some teams aren't managed by me).
const settingsSchema = new mongoose.Schema(
  {
    owner: { ...ref, unique: true },
    receivableTeams: { type: [String], default: [] },
    includeInvoices: { type: Boolean, default: true },
    // Unpaid invoices I chose NOT to count (new invoices count by default)
    excludedInvoices: [{ type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }],
    // Telegram alerts — sent only to this Admin's own linked Telegram chat.
    alerts: {
      orders: { type: Boolean, default: false }, // new bot orders
      stock: { type: Boolean, default: false }, // product low / out of stock
      debts: { type: Boolean, default: false }, // pay day tomorrow, auto-paid
      owed: { type: Boolean, default: false }, // weekly "owed to me"
      daily: { type: Boolean, default: false }, // evening summary
      dailyHour: { type: Number, min: 0, max: 23, default: 20 },
    },
  },
  { timestamps: true }
);

// Investments / betting: each "pot" (e.g. "Sport betting", "Gold") has
// entries — a day's result (win + / loss −), or money moved in / out.
//   balance     = deposits − withdrawals + results
//   profit/loss = sum of results only
const investmentSchema = new mongoose.Schema(
  {
    owner: ref,
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["betting", "gold", "crypto", "stock", "business", "other"], default: "other" },
    currency: { type: String, enum: ["USD", "KHR"], default: "USD" },
    note: { type: String, trim: true, default: "" },
    // My own limits (0 = none): stop when this month's loss reaches X,
    // and the most I stake in one day.
    monthlyLossLimit: { type: Number, min: 0, default: 0 },
    dailyStakeLimit: { type: Number, min: 0, default: 0 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const investEntrySchema = new mongoose.Schema(
  {
    owner: ref,
    investment: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceInvestment", required: true, index: true },
    type: { type: String, enum: ["result", "deposit", "withdraw"], required: true },
    // result: + win / − loss; deposit / withdraw: always positive
    amount: { type: Number, required: true },
    amountUSD: { type: Number, default: 0 },
    stake: { type: Number, min: 0, default: 0 }, // how much was bet (result only)
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    txn: { type: mongoose.Schema.Types.ObjectId, ref: "FinanceTxn", default: null }, // money in/out of an account
  },
  { timestamps: true }
);
investEntrySchema.index({ investment: 1, date: -1 });

module.exports = {
  FinanceInvestment: mongoose.model("FinanceInvestment", investmentSchema),
  FinanceInvestEntry: mongoose.model("FinanceInvestEntry", investEntrySchema),
  FinanceAccount: mongoose.model("FinanceAccount", accountSchema),
  FinanceSettings: mongoose.model("FinanceSettings", settingsSchema),
  FinanceTxn: mongoose.model("FinanceTxn", txnSchema),
  FinanceDebt: mongoose.model("FinanceDebt", debtSchema),
  FinancePlan: mongoose.model("FinancePlan", planSchema),
};
