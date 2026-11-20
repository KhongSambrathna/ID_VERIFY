const mongoose = require("mongoose");
const { FinanceTxn, FinanceDebt, FinancePlan } = require("../models/Finance");
const { roundUSD } = require("../utils/currency");

const KHR_PER_USD = 4000;
const TZ = "Asia/Phnom_Penh";
const TZ_OFFSET = "+07:00";

const num = (v, fb = NaN) => (v === undefined || v === null || v === "" ? fb : Number.isFinite(Number(v)) ? Number(v) : NaN);
const toUSD = (amount, currency) => roundUSD(currency === "KHR" ? amount / KHR_PER_USD : amount);
function day(str, fallbackNow = true) {
  if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T12:00:00${TZ_OFFSET}`);
  if (str) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallbackNow ? new Date() : null;
}
// "2026-11" → [start, end) of that month in Phnom Penh time
function monthRange(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || "");
  let y, mo;
  if (m) {
    y = +m[1];
    mo = +m[2];
  } else {
    const [yy, mm] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date()).split("-");
    y = +yy;
    mo = +mm;
  }
  const start = new Date(`${y}-${String(mo).padStart(2, "0")}-01T00:00:00${TZ_OFFSET}`);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  const end = new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00${TZ_OFFSET}`);
  return { start, end, key: `${y}-${String(mo).padStart(2, "0")}`, daysInMonth: Math.round((end - start) / 86400000) };
}
function readMoney(body, target) {
  const amount = num(body.amount);
  if (Number.isNaN(amount) || amount < 0) return "Enter a valid amount";
  const currency = body.currency === "KHR" ? "KHR" : "USD";
  target.amount = currency === "KHR" ? Math.round(amount) : roundUSD(amount);
  target.currency = currency;
  target.amountUSD = toUSD(target.amount, currency);
  return null;
}
const own = (req) => ({ owner: req.adminId });
function bad(res, msg) {
  return res.status(400).json({ message: msg });
}
function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  };
}

// Debt balance: amount minus repayments (in the debt's own currency).
function debtView(d) {
  const o = d.toObject ? d.toObject() : d;
  const paid = o.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(o.amount - paid, 0);
  const r = o.currency === "KHR" ? Math.round : roundUSD;
  return {
    ...o,
    paid: r(paid),
    remaining: r(remaining),
    remainingUSD: toUSD(remaining, o.currency),
    monthlyInterest: r((remaining * (o.interestRate || 0)) / 100),
    progress: o.amount > 0 ? Math.min(Math.round((paid / o.amount) * 100), 100) : 0,
  };
}

// ---------------- Transactions ----------------

// GET /api/finance/txns?month=YYYY-MM&type=&category=
exports.listTxns = wrap(async (req, res) => {
  const { start, end } = monthRange(req.query.month);
  const filter = { ...own(req), date: { $gte: start, $lt: end } };
  if (["income", "expense"].includes(req.query.type)) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  res.json(await FinanceTxn.find(filter).sort({ date: -1, createdAt: -1 }));
});

function readTxn(body, t) {
  if (body.type !== undefined) {
    if (!["income", "expense"].includes(body.type)) return "Choose income or expense";
    t.type = body.type;
  }
  if (body.amount !== undefined) {
    const err = readMoney(body, t);
    if (err) return err;
    if (!(t.amount > 0)) return "Enter an amount greater than 0";
  }
  if (body.category !== undefined) t.category = String(body.category).trim() || "other";
  if (body.method !== undefined) t.method = String(body.method).trim() || "cash";
  if (body.note !== undefined) t.note = String(body.note).trim();
  if (body.date !== undefined) t.date = day(body.date);
  return null;
}

exports.createTxn = wrap(async (req, res) => {
  const t = new FinanceTxn({ owner: req.adminId, date: new Date() });
  const err = readTxn({ type: "expense", ...req.body }, t);
  if (err) return bad(res, err);
  if (req.body.amount === undefined) return bad(res, "Enter an amount");
  await t.save();
  res.status(201).json(t);
});

exports.updateTxn = wrap(async (req, res) => {
  const t = await FinanceTxn.findOne({ _id: req.params.id, ...own(req) });
  if (!t) return res.status(404).json({ message: "Not found" });
  if (t.debt) return bad(res, "This entry is a debt repayment — change it from the Debts tab");
  const err = readTxn(req.body, t);
  if (err) return bad(res, err);
  await t.save();
  res.json(t);
});

exports.deleteTxn = wrap(async (req, res) => {
  const t = await FinanceTxn.findOne({ _id: req.params.id, ...own(req) });
  if (!t) return res.status(404).json({ message: "Not found" });
  if (t.debt) {
    // keep the debt in step: remove the matching repayment too
    await FinanceDebt.updateOne({ _id: t.debt, ...own(req) }, { $pull: { payments: { txn: t._id } } });
  }
  await t.deleteOne();
  res.json({ message: "Deleted" });
});

// ---------------- Debts ----------------

exports.listDebts = wrap(async (req, res) => {
  const debts = await FinanceDebt.find(own(req)).sort({ closed: 1, dueDate: 1, createdAt: -1 });
  res.json(debts.map(debtView));
});

function readDebt(body, d) {
  if (body.direction !== undefined) d.direction = body.direction === "lend" ? "lend" : "owe";
  if (body.party !== undefined) d.party = String(body.party).trim();
  if (body.phone !== undefined) d.phone = String(body.phone).trim();
  if (body.amount !== undefined) {
    const err = readMoney(body, d);
    if (err) return err;
  }
  for (const k of ["interestRate", "monthlyPayment"]) {
    if (body[k] === undefined) continue;
    const v = num(body[k], 0);
    if (Number.isNaN(v) || v < 0) return "Enter valid numbers";
    d[k] = v;
  }
  if (body.paymentDay !== undefined) {
    const v = num(body.paymentDay, 0);
    if (Number.isNaN(v) || v < 0 || v > 31) return "Payment day must be 1–31";
    d.paymentDay = Math.round(v);
  }
  if (body.startDate !== undefined) d.startDate = day(body.startDate, false);
  if (body.dueDate !== undefined) d.dueDate = day(body.dueDate, false);
  if (body.note !== undefined) d.note = String(body.note).trim();
  if (body.closed !== undefined) d.closed = Boolean(body.closed);
  if (!d.party) return "Enter who the debt is with";
  return null;
}

exports.createDebt = wrap(async (req, res) => {
  if (req.body.amount === undefined) return bad(res, "Enter the amount");
  const d = new FinanceDebt({ owner: req.adminId, party: "" });
  const err = readDebt(req.body, d);
  if (err) return bad(res, err);
  await d.save();
  res.status(201).json(debtView(d));
});

exports.updateDebt = wrap(async (req, res) => {
  const d = await FinanceDebt.findOne({ _id: req.params.id, ...own(req) });
  if (!d) return res.status(404).json({ message: "Not found" });
  const err = readDebt(req.body, d);
  if (err) return bad(res, err);
  await d.save();
  res.json(debtView(d));
});

exports.deleteDebt = wrap(async (req, res) => {
  const d = await FinanceDebt.findOne({ _id: req.params.id, ...own(req) });
  if (!d) return res.status(404).json({ message: "Not found" });
  // Repayments stay in the daily log as ordinary entries.
  await FinanceTxn.updateMany({ debt: d._id, ...own(req) }, { $set: { debt: null } });
  await d.deleteOne();
  res.json({ message: "Deleted" });
});

// POST /api/finance/debts/:id/payments  { amount, date?, note?, recordTxn? }
// A repayment. By default it's also written to the daily log — as an
// expense when I'm paying my debt, as income when someone pays me back.
exports.addPayment = wrap(async (req, res) => {
  const d = await FinanceDebt.findOne({ _id: req.params.id, ...own(req) });
  if (!d) return res.status(404).json({ message: "Not found" });
  const p = { date: day(req.body.date), note: String(req.body.note || "").trim() };
  const err = readMoney({ amount: req.body.amount, currency: d.currency }, p);
  if (err) return bad(res, err);
  if (!(p.amount > 0)) return bad(res, "Enter an amount greater than 0");
  if (req.body.recordTxn !== false) {
    const t = await FinanceTxn.create({
      owner: req.adminId,
      type: d.direction === "owe" ? "expense" : "income",
      amount: p.amount,
      currency: p.currency,
      amountUSD: p.amountUSD,
      category: "debt",
      method: String(req.body.method || "cash"),
      date: p.date,
      note: `${d.direction === "owe" ? "💳 →" : "🤝 ←"} ${d.party}${p.note ? ` · ${p.note}` : ""}`,
      debt: d._id,
    });
    p.txn = t._id;
  }
  d.payments.push(p);
  const v = debtView(d);
  if (v.remaining <= 0) d.closed = true;
  await d.save();
  res.status(201).json(debtView(d));
});

exports.deletePayment = wrap(async (req, res) => {
  const d = await FinanceDebt.findOne({ _id: req.params.id, ...own(req) });
  if (!d) return res.status(404).json({ message: "Not found" });
  const p = d.payments.id(req.params.paymentId);
  if (!p) return res.status(404).json({ message: "Payment not found" });
  if (p.txn) await FinanceTxn.deleteOne({ _id: p.txn, ...own(req) });
  p.deleteOne();
  if (debtView(d).remaining > 0) d.closed = false;
  await d.save();
  res.json(debtView(d));
});

// ---------------- Monthly plan (expected income / expenses) ----------------

exports.listPlans = wrap(async (req, res) => {
  res.json(await FinancePlan.find(own(req)).sort({ kind: -1, active: -1, name: 1 }));
});

function readPlan(body, p) {
  if (body.kind !== undefined) {
    if (!["income", "expense"].includes(body.kind)) return "Choose income or expense";
    p.kind = body.kind;
  }
  if (body.name !== undefined) p.name = String(body.name).trim();
  if (body.category !== undefined) p.category = String(body.category).trim() || "other";
  if (body.amount !== undefined) {
    const err = readMoney(body, p);
    if (err) return err;
  }
  if (body.timesPerMonth !== undefined) {
    const v = num(body.timesPerMonth, 1);
    if (Number.isNaN(v) || v < 0 || v > 31) return "Times per month must be 0–31";
    p.timesPerMonth = v;
  }
  if (body.active !== undefined) p.active = Boolean(body.active);
  if (!p.name) return "Enter a name";
  return null;
}

exports.createPlan = wrap(async (req, res) => {
  if (req.body.amount === undefined) return bad(res, "Enter the amount");
  const p = new FinancePlan({ owner: req.adminId, name: "", kind: "expense" });
  const err = readPlan(req.body, p);
  if (err) return bad(res, err);
  await p.save();
  res.status(201).json(p);
});

exports.updatePlan = wrap(async (req, res) => {
  const p = await FinancePlan.findOne({ _id: req.params.id, ...own(req) });
  if (!p) return res.status(404).json({ message: "Not found" });
  const err = readPlan(req.body, p);
  if (err) return bad(res, err);
  await p.save();
  res.json(p);
});

exports.deletePlan = wrap(async (req, res) => {
  const r = await FinancePlan.deleteOne({ _id: req.params.id, ...own(req) });
  if (!r.deletedCount) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

// ---------------- Monthly summary ----------------

// GET /api/finance/summary?month=YYYY-MM
// Actual income/expense for the month (by category and by day), the
// monthly plan vs actual, debt totals, and a month-end projection.
exports.summary = wrap(async (req, res) => {
  const { start, end, key, daysInMonth } = monthRange(req.query.month);
  const owner = new mongoose.Types.ObjectId(String(req.adminId));
  const match = { owner, date: { $gte: start, $lt: end } };

  const [byCat, byDay, plans, debts] = await Promise.all([
    FinanceTxn.aggregate([
      { $match: match },
      { $group: { _id: { type: "$type", category: "$category" }, total: { $sum: "$amountUSD" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    FinanceTxn.aggregate([
      { $match: match },
      {
        $group: {
          _id: { d: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: TZ } }, type: "$type" },
          total: { $sum: "$amountUSD" },
        },
      },
    ]),
    FinancePlan.find({ owner, active: true }).lean(),
    FinanceDebt.find({ owner }).lean(),
  ]);

  const income = roundUSD(byCat.filter((r) => r._id.type === "income").reduce((s, r) => s + r.total, 0));
  const expense = roundUSD(byCat.filter((r) => r._id.type === "expense").reduce((s, r) => s + r.total, 0));

  const series = [];
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(start.getTime() + i * 86400000 + 12 * 3600000)
    );
    const inc = byDay.find((r) => r._id.d === d && r._id.type === "income");
    const exp = byDay.find((r) => r._id.d === d && r._id.type === "expense");
    series.push({ day: d, income: roundUSD(inc?.total || 0), expense: roundUSD(exp?.total || 0) });
  }

  // Plan vs actual, per plan category (actual = this month's entries in
  // the same category).
  const planRows = plans.map((p) => {
    const monthly = roundUSD(p.amountUSD * (p.timesPerMonth ?? 1));
    return { _id: p._id, kind: p.kind, name: p.name, category: p.category, monthly };
  });
  const plannedIncome = roundUSD(planRows.filter((p) => p.kind === "income").reduce((s, p) => s + p.monthly, 0));
  const plannedExpense = roundUSD(planRows.filter((p) => p.kind === "expense").reduce((s, p) => s + p.monthly, 0));

  // Category list with plan amounts next to actuals.
  const catKeys = new Set([...byCat.map((r) => `${r._id.type}|${r._id.category}`), ...planRows.map((p) => `${p.kind}|${p.category}`)]);
  const categories = [...catKeys].map((k) => {
    const [type, category] = k.split("|");
    const a = byCat.find((r) => r._id.type === type && r._id.category === category);
    const planned = roundUSD(planRows.filter((p) => p.kind === type && p.category === category).reduce((s, p) => s + p.monthly, 0));
    return { type, category, actual: roundUSD(a?.total || 0), count: a?.count || 0, planned };
  });

  // Debts
  const views = debts.map(debtView);
  const openOwe = views.filter((d) => d.direction === "owe" && !d.closed);
  const openLend = views.filter((d) => d.direction === "lend" && !d.closed);
  const monthlyDebtPayments = roundUSD(openOwe.reduce((s, d) => s + toUSD(d.monthlyPayment || 0, d.currency), 0));
  const upcoming = openOwe
    .filter((d) => d.paymentDay > 0 || d.dueDate)
    .map((d) => ({ _id: d._id, party: d.party, paymentDay: d.paymentDay, dueDate: d.dueDate, monthlyPayment: d.monthlyPayment, currency: d.currency, remaining: d.remaining }))
    .sort((a, b) => (a.paymentDay || 99) - (b.paymentDay || 99));

  // Month-end projection: what's happened so far + what's still planned.
  const now = new Date();
  const elapsed = now < start ? 0 : now >= end ? 1 : (now - start) / (end - start);
  const projectedIncome = roundUSD(Math.max(income, plannedIncome));
  const projectedExpense = roundUSD(Math.max(expense, plannedExpense + monthlyDebtPayments, elapsed > 0 ? expense / elapsed : 0));

  res.json({
    month: key,
    income,
    expense,
    net: roundUSD(income - expense),
    plannedIncome,
    plannedExpense,
    monthlyDebtPayments,
    plannedNet: roundUSD(plannedIncome - plannedExpense - monthlyDebtPayments),
    projectedIncome,
    projectedExpense,
    projectedNet: roundUSD(projectedIncome - projectedExpense),
    monthElapsedPct: Math.round(elapsed * 100),
    categories: categories.sort((a, b) => b.actual - a.actual || b.planned - a.planned),
    series,
    debts: {
      oweUSD: roundUSD(openOwe.reduce((s, d) => s + d.remainingUSD, 0)),
      lendUSD: roundUSD(openLend.reduce((s, d) => s + d.remainingUSD, 0)),
      openOwe: openOwe.length,
      openLend: openLend.length,
      monthlyInterestUSD: roundUSD(openOwe.reduce((s, d) => s + toUSD(d.monthlyInterest, d.currency), 0)),
      upcoming,
    },
  });
});
