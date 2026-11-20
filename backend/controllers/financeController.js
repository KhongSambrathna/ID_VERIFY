const mongoose = require("mongoose");
const { FinanceTxn, FinanceDebt, FinancePlan, FinanceAccount, FinanceSettings, FinanceInvestEntry } = require("../models/Finance");
const Athlete = require("../models/Athlete");
const Invoice = require("../models/Invoice");
const { roundUSD } = require("../utils/currency");

const KHR_PER_USD = 4000;
const TZ = "Asia/Phnom_Penh";
const TZ_OFFSET = "+07:00";

const num = (v, fb = NaN) => (v === undefined || v === null || v === "" ? fb : Number.isFinite(Number(v)) ? Number(v) : NaN);
// Dollars → Riel, rounded to the nearest ៛100 (smallest note in use).
const KHR_ROUND = (usd) => Math.round(((Number(usd) || 0) * KHR_PER_USD) / 100) * 100;
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
      if (err && err.status) return res.status(err.status).json({ message: err.message });
      res.status(500).json({ message: err.message });
    }
  };
}

// Debt balance: amount minus repayments (in the debt's own currency).
// Debt balance: amount minus the principal part of every repayment (the
// interest part of a payment doesn't reduce the debt).
function debtView(d) {
  const o = d.toObject ? d.toObject() : d;
  const r = o.currency === "KHR" ? Math.round : roundUSD;
  const totalPaid = o.payments.reduce((s, p) => s + p.amount, 0);
  const interestPaid = o.payments.reduce((s, p) => s + (p.interest || 0), 0);
  const paid = totalPaid - interestPaid; // principal repaid
  const remaining = Math.max(o.amount - paid, 0);
  const monthlyInterest = r((remaining * (o.interestRate || 0)) / 100);
  const repayType = o.repayType || "fixed";
  // What has to be paid each month for planning:
  //   fixed -> the set monthly payment; interest-only -> at least the interest;
  //   flexible -> only if a monthly amount was set.
  const monthlyDue =
    repayType === "interest_only" ? r(Math.max(o.monthlyPayment || 0, monthlyInterest)) : r(o.monthlyPayment || 0);
  const principalPerMonth = Math.max((o.monthlyPayment || 0) - monthlyInterest, 0);
  return {
    ...o,
    payments: [...o.payments].sort((x, y) => new Date(x.date) - new Date(y.date)),
    repayType,
    paid: r(paid),
    totalPaid: r(totalPaid),
    interestPaid: r(interestPaid),
    remaining: r(remaining),
    remainingUSD: toUSD(remaining, o.currency),
    monthlyInterest,
    monthlyDue,
    monthsLeft:
      repayType === "fixed" && principalPerMonth > 0 && remaining > 0 ? Math.ceil(remaining / principalPerMonth) : null,
    progress: o.amount > 0 ? Math.min(Math.round((paid / o.amount) * 100), 100) : 0,
    autoPay: o.autoPay !== false,
    nextAutoDate: nextAutoDate({ ...o, repayType }),
  };
}

// Checks an account id belongs to this Admin. Returns the account, null for
// "no account", or throws a 400.
async function ownAccount(req, id) {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) throw { status: 400, message: "Invalid account" };
  const a = await FinanceAccount.findOne({ _id: id, ...own(req) });
  if (!a) throw { status: 400, message: "Account not found" };
  return a;
}

// ---------------- Transactions ----------------

// GET /api/finance/txns?month=YYYY-MM&type=&category=
exports.listTxns = wrap(async (req, res) => {
  await syncAutoPayments(req);
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
  const acc = await ownAccount(req, req.body.account);
  t.account = acc ? acc._id : null;
  if (acc) t.method = acc.kind === "cash" ? "cash" : "bank";
  await t.save();
  res.status(201).json(t);
});

exports.updateTxn = wrap(async (req, res) => {
  const t = await FinanceTxn.findOne({ _id: req.params.id, ...own(req) });
  if (!t) return res.status(404).json({ message: "Not found" });
  if (t.debt) return bad(res, "This entry is a debt repayment — change it from the Debts tab");
  const err = readTxn(req.body, t);
  if (err) return bad(res, err);
  if (req.body.account !== undefined) {
    const acc = await ownAccount(req, req.body.account);
    t.account = acc ? acc._id : null;
    if (acc) t.method = acc.kind === "cash" ? "cash" : "bank";
  }
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
  await syncAutoPayments(req);
  const debts = await FinanceDebt.find(own(req)).sort({ closed: 1, dueDate: 1, createdAt: -1 });
  res.json(debts.map(debtView));
});

function readDebt(body, d) {
  if (body.direction !== undefined) d.direction = body.direction === "lend" ? "lend" : "owe";
  if (body.repayType !== undefined) {
    d.repayType = ["fixed", "interest_only", "flexible"].includes(body.repayType) ? body.repayType : "fixed";
  }
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
  if (body.autoPay !== undefined) {
    const on = Boolean(body.autoPay);
    // Turning it on (again) starts from now — earlier months aren't filled in.
    if (on && (!d.autoPay || !d.autoFrom)) {
      d.autoFrom = new Date();
      d.autoDoneThrough = "";
    }
    d.autoPay = on;
  }
  if (!d.party) return "Enter who the debt is with";
  return null;
}

exports.createDebt = wrap(async (req, res) => {
  if (req.body.amount === undefined) return bad(res, "Enter the amount");
  const d = new FinanceDebt({ owner: req.adminId, party: "" });
  const err = readDebt(req.body, d);
  if (err) return bad(res, err);
  if (req.body.payAccount !== undefined) d.payAccount = (await ownAccount(req, req.body.payAccount))?._id || null;
  if (!d.autoFrom) d.autoFrom = new Date();
  await d.save();
  res.status(201).json(debtView(d));
});

exports.updateDebt = wrap(async (req, res) => {
  const d = await FinanceDebt.findOne({ _id: req.params.id, ...own(req) });
  if (!d) return res.status(404).json({ message: "Not found" });
  const err = readDebt(req.body, d);
  if (err) return bad(res, err);
  if (req.body.payAccount !== undefined) d.payAccount = (await ownAccount(req, req.body.payAccount))?._id || null;
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
// Adds one repayment to debt d (not saved). Returns an error string or null.
// opts: { amount, date, note, split, interest, account, recordTxn, method, auto }
async function recordPayment(req, d, opts) {
  const p = { date: opts.date || new Date(), note: String(opts.note || "").trim(), auto: Boolean(opts.auto) };
  const err = readMoney({ amount: opts.amount, currency: d.currency }, p);
  if (err) return err;
  if (!(p.amount > 0)) return "Enter an amount greater than 0";
  // Split into interest / principal. split: "auto" (default - this month's
  // interest first, the rest pays down the debt), "interest" (all interest),
  // "principal" (all off the debt), or an explicit interest amount.
  const view = debtView(d);
  const r = d.currency === "KHR" ? Math.round : roundUSD;
  const split = opts.split || "auto";
  if (split === "interest") p.interest = p.amount;
  else if (split === "principal") p.interest = 0;
  else if (opts.interest !== undefined && opts.interest !== "") {
    const v = num(opts.interest);
    if (Number.isNaN(v) || v < 0 || v > p.amount) return "Interest part must be between 0 and the payment";
    p.interest = r(v);
  } else p.interest = r(Math.min(p.amount, view.monthlyInterest));
  // never pay off more principal than is left
  if (p.amount - p.interest > view.remaining) p.interest = r(p.amount - view.remaining);
  if (opts.recordTxn !== false) {
    const acc = await ownAccount(req, opts.account);
    const t = await FinanceTxn.create({
      account: acc ? acc._id : null,
      owner: d.owner,
      type: d.direction === "owe" ? "expense" : "income",
      amount: p.amount,
      currency: p.currency,
      amountUSD: p.amountUSD,
      category: "debt",
      method: acc ? (acc.kind === "cash" ? "cash" : "bank") : String(opts.method || "cash"),
      date: p.date,
      note: `${d.direction === "owe" ? "💳 →" : "🤝 ←"} ${d.party}${p.interest > 0 ? (p.interest >= p.amount ? " (%)" : ` (% ${p.interest})`) : ""}${p.auto ? " · 🤖" : ""}${p.note ? ` · ${p.note}` : ""}`,
      debt: d._id,
    });
    p.txn = t._id;
  }
  d.payments.push(p);
  if (debtView(d).remaining <= 0) d.closed = true;
  return null;
}

// POST /api/finance/debts/:id/payments  { amount, date?, note?, split?, interest?, account?, recordTxn? }
// A repayment. By default it's also written to the daily log — as an
// expense when I'm paying my debt, as income when someone pays me back.
exports.addPayment = wrap(async (req, res) => {
  const d = await FinanceDebt.findOne({ _id: req.params.id, ...own(req) });
  if (!d) return res.status(404).json({ message: "Not found" });
  const err = await recordPayment(req, d, { ...req.body, date: day(req.body.date) });
  if (err) return bad(res, err);
  await d.save();
  res.status(201).json(debtView(d));
});

// ---------------- Auto-pay ----------------
// For fixed / interest-only debts I owe with a pay day: once the pay day of a
// month has passed, that month counts as paid — a payment (interest first)
// is recorded on the pay day, from the chosen account. Months that already
// have a payment I entered myself are skipped. Runs whenever finance data
// is read, so there's no background job.
const ymKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(date);
function nextYm(key) {
  let [y, m] = key.split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
// The pay day inside month `key` (12:00 Phnom Penh), clamped to month length.
function dueInMonth(key, payDay) {
  const { daysInMonth } = monthRange(key);
  const dd = Math.min(payDay, daysInMonth);
  return new Date(`${key}-${String(dd).padStart(2, "0")}T12:00:00${TZ_OFFSET}`);
}
// The pay day counts as "passed" from the start of the next day.
const dueHasPassed = (due, now) => now.getTime() >= due.getTime() + 12 * 3600000;

function nextAutoDate(o, now = new Date()) {
  if (!autoEligible(o)) return null;
  let key = ymKey(now);
  for (let i = 0; i < 3; i++) {
    const due = dueInMonth(key, o.paymentDay);
    if (!dueHasPassed(due, now) && (!o.autoFrom || due >= o.autoFrom)) return due;
    key = nextYm(key);
  }
  return null;
}
function autoEligible(o) {
  return (
    o.autoPay !== false &&
    o.direction === "owe" &&
    !o.closed &&
    ["fixed", "interest_only"].includes(o.repayType || "fixed") &&
    o.paymentDay > 0
  );
}

async function syncAutoPayments(req) {
  const now = new Date();
  const autoPaidNow = [];
  const nowKey = ymKey(now);
  const debts = await FinanceDebt.find({
    ...own(req),
    direction: "owe",
    closed: false,
    autoPay: { $ne: false },
    paymentDay: { $gt: 0 },
    repayType: { $in: ["fixed", "interest_only", null] },
  });
  for (const d of debts) {
    if (!d.autoFrom) {
      // Older debts: start auto-pay from today, never back-fill the past.
      await FinanceDebt.updateOne({ _id: d._id, autoFrom: null }, { $set: { autoFrom: now } });
      continue;
    }
    let key = d.autoDoneThrough ? nextYm(d.autoDoneThrough) : ymKey(d.autoFrom);
    let doneThrough = d.autoDoneThrough;
    let changed = false;
    for (let guard = 0; key <= nowKey && guard < 36; guard++, key = nextYm(key)) {
      const due = dueInMonth(key, d.paymentDay);
      if (!dueHasPassed(due, now)) break;
      // Claim this month first so two requests at once can't both pay it.
      const claim = await FinanceDebt.updateOne(
        { _id: d._id, autoDoneThrough: doneThrough || { $in: ["", null] } },
        { $set: { autoDoneThrough: key } }
      );
      if (!claim.modifiedCount) break;
      d.autoDoneThrough = doneThrough = key;
      if (due < d.autoFrom || (d.startDate && due < d.startDate) || d.closed) continue;
      if (d.payments.some((p) => ymKey(p.date) === key)) continue; // I already paid it myself
      const v = debtView(d);
      const amount =
        d.repayType === "interest_only" ? v.monthlyDue : Math.min(v.monthlyDue, v.remaining + v.monthlyInterest);
      if (!(amount > 0)) continue;
      const acc = d.payAccount ? await FinanceAccount.findOne({ _id: d.payAccount, ...own(req) }) : null;
      const err = await recordPayment(req, d, { amount, date: due, account: acc ? acc._id : null, auto: true, split: "auto" });
      if (!err) {
        changed = true;
        autoPaidNow.push({ debt: d, payment: d.payments[d.payments.length - 1] });
      }
    }
    if (changed) {
      d.autoDoneThrough = doneThrough;
      await d.save();
    }
  }
  if (autoPaidNow.length) {
    const alerts = require("../utils/telegramAlerts");
    for (const x of autoPaidNow) alerts.alertAutoPaid(req.adminId, debtView(x.debt), x.payment).catch(() => {});
  }
}
exports.syncAutoPayments = syncAutoPayments;

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
  if (body.sure !== undefined) p.sure = Boolean(body.sure);
  if (body.essential !== undefined) p.essential = Boolean(body.essential);
  if (body.note !== undefined) p.note = String(body.note).trim().slice(0, 200);
  if (body.oneTime !== undefined) p.oneTime = Boolean(body.oneTime);
  if (body.month !== undefined) p.month = String(body.month || "").trim();
  if (body.done !== undefined) p.done = Boolean(body.done);
  if (p.oneTime && !/^\d{4}-\d{2}$/.test(p.month || "")) return "Choose the month";
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
  await syncAutoPayments(req);
  const { start, end, key, daysInMonth } = monthRange(req.query.month);
  const owner = new mongoose.Types.ObjectId(String(req.adminId));
  // Moving money between my own accounts isn't income or spending.
  const match = { owner, date: { $gte: start, $lt: end }, category: { $nin: ["transfer", "invest"] } };

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
  // One-time items count only in their own month.
  const planRows = plans.filter((p) => !p.oneTime || p.month === key).map((p) => {
    const monthly = roundUSD(p.oneTime ? p.amountUSD : p.amountUSD * (p.timesPerMonth ?? 1));
    return { _id: p._id, kind: p.kind, name: p.name, category: p.category, monthly, sure: p.sure !== false, essential: p.essential !== false };
  });
  const plannedIncomeSure = roundUSD(planRows.filter((p) => p.kind === "income" && p.sure).reduce((s, p) => s + p.monthly, 0));
  const plannedEssential = roundUSD(planRows.filter((p) => p.kind === "expense" && p.essential).reduce((s, p) => s + p.monthly, 0));
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
  const monthlyDebtPayments = roundUSD(openOwe.reduce((s, d) => s + toUSD(d.monthlyDue || 0, d.currency), 0));
  const upcoming = openOwe
    .filter((d) => d.paymentDay > 0 || d.dueDate)
    .map((d) => ({
      _id: d._id,
      party: d.party,
      repayType: d.repayType,
      paymentDay: d.paymentDay,
      dueDate: d.dueDate,
      monthlyPayment: d.monthlyDue,
      currency: d.currency,
      remaining: d.remaining,
    }))
    .sort((a, b) => (a.paymentDay || 99) - (b.paymentDay || 99));

  // Month-end projection: what's happened so far + what's still planned.
  const now = new Date();
  const elapsed = now < start ? 0 : now >= end ? 1 : (now - start) / (end - start);
  const projectedIncome = roundUSD(Math.max(income, plannedIncome));
  const projectedExpense = roundUSD(Math.max(expense, plannedExpense + monthlyDebtPayments, elapsed > 0 ? expense / elapsed : 0));

  const accounts = (await accountsWithBalance(req)).filter((a) => !a.archived);
  res.json({
    month: key,
    moneyNowUSD: roundUSD(accounts.reduce((s, a) => s + a.balanceUSD, 0)),
    accountCount: accounts.length,
    income,
    expense,
    net: roundUSD(income - expense),
    plannedIncome,
    plannedExpense,
    monthlyDebtPayments,
    plannedNet: roundUSD(plannedIncome - plannedExpense - monthlyDebtPayments),
    plannedIncomeSure,
    plannedEssential,
    investMonthPnlUSD: roundUSD(
      (
        await FinanceInvestEntry.aggregate([
          { $match: { owner, type: "result", date: { $gte: start, $lt: end } } },
          { $group: { _id: null, t: { $sum: "$amountUSD" } } },
        ])
      )[0]?.t || 0
    ),
    investCount: await require("../models/Finance").FinanceInvestment.countDocuments({ owner, archived: false }),
    // Worst case: only the sure income comes in, only essentials are paid.
    plannedSafeNet: roundUSD(plannedIncomeSure - plannedEssential - monthlyDebtPayments),
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

// ---------------- Accounts (where my money is) ----------------

const KHR = (usd) => Math.round(usd * KHR_PER_USD);
// Converts a transaction's amount into the account's currency.
function inAccountCurrency(t, currency) {
  if (t.currency === currency) return t.amount;
  return currency === "KHR" ? KHR(t.amountUSD) : t.amountUSD;
}

async function accountsWithBalance(req) {
  const accounts = await FinanceAccount.find(own(req)).sort({ archived: 1, kind: 1, name: 1 }).lean();
  const txns = await FinanceTxn.find({ ...own(req), account: { $in: accounts.map((a) => a._id) } })
    .select("account type amount currency amountUSD date createdAt")
    .lean();
  return accounts.map((a) => {
    let bal = a.openingBalance || 0;
    for (const t of txns) {
      if (String(t.account) !== String(a._id)) continue;
      // The balance I typed in already includes everything before that
      // moment. Count an entry if it's dated after it OR I recorded it after
      // it (e.g. today's income entered this evening, dated today 12:00).
      if (a.openingDate && t.date < a.openingDate && !(t.createdAt && t.createdAt >= a.openingDate)) continue;
      const v = inAccountCurrency(t, a.currency);
      bal += t.type === "income" ? v : -v;
    }
    bal = a.currency === "KHR" ? Math.round(bal) : roundUSD(bal);
    return { ...a, balance: bal, balanceUSD: toUSD(bal, a.currency) };
  });
}

exports.listAccounts = wrap(async (req, res) => {
  await syncAutoPayments(req);
  const list = await accountsWithBalance(req);
  const active = list.filter((a) => !a.archived);
  res.json({ accounts: list, totalUSD: roundUSD(active.reduce((s, a) => s + a.balanceUSD, 0)) });
});

function readAccount(body, a) {
  if (body.name !== undefined) a.name = String(body.name).trim();
  if (body.kind !== undefined) a.kind = ["cash", "bank", "wallet", "other"].includes(body.kind) ? body.kind : "other";
  if (body.currency !== undefined) a.currency = body.currency === "KHR" ? "KHR" : "USD";
  if (body.note !== undefined) a.note = String(body.note).trim();
  if (body.archived !== undefined) a.archived = Boolean(body.archived);
  if (body.openingBalance !== undefined) {
    const v = num(body.openingBalance, 0);
    if (Number.isNaN(v)) return "Enter a valid balance";
    a.openingBalance = a.currency === "KHR" ? Math.round(v) : roundUSD(v);
    a.openingDate = new Date();
  }
  if (!a.name) return "Enter the account name";
  return null;
}

exports.createAccount = wrap(async (req, res) => {
  const a = new FinanceAccount({ owner: req.adminId, name: "" });
  const err = readAccount(req.body, a);
  if (err) return bad(res, err);
  await a.save();
  res.status(201).json(a);
});

// PUT /api/finance/accounts/:id — openingBalance here means "the real
// balance right now" (counting restarts from this moment).
exports.updateAccount = wrap(async (req, res) => {
  const a = await FinanceAccount.findOne({ _id: req.params.id, ...own(req) });
  if (!a) return res.status(404).json({ message: "Not found" });
  const err = readAccount(req.body, a);
  if (err) return bad(res, err);
  await a.save();
  res.json(a);
});

exports.deleteAccount = wrap(async (req, res) => {
  const a = await FinanceAccount.findOne({ _id: req.params.id, ...own(req) });
  if (!a) return res.status(404).json({ message: "Not found" });
  await FinanceTxn.updateMany({ account: a._id, ...own(req) }, { $set: { account: null } });
  await a.deleteOne();
  res.json({ message: "Deleted" });
});

// POST /api/finance/accounts/transfer { from, to, amount, date?, note? }
// e.g. withdrawing cash from ABA. Recorded as two "transfer" entries that
// move the balances but don't count as income or spending.
exports.transfer = wrap(async (req, res) => {
  const from = await ownAccount(req, req.body.from);
  const to = await ownAccount(req, req.body.to);
  if (!from || !to || String(from._id) === String(to._id)) return bad(res, "Choose two different accounts");
  const amount = num(req.body.amount);
  if (Number.isNaN(amount) || amount <= 0) return bad(res, "Enter an amount greater than 0");
  const date = day(req.body.date);
  const note = String(req.body.note || "").trim();
  const outAmt = from.currency === "KHR" ? Math.round(amount) : roundUSD(amount);
  const usd = toUSD(outAmt, from.currency);
  const inAmt = to.currency === from.currency ? outAmt : to.currency === "KHR" ? KHR(usd) : usd;
  await FinanceTxn.create([
    { owner: req.adminId, type: "expense", amount: outAmt, currency: from.currency, amountUSD: usd, category: "transfer", method: from.kind === "cash" ? "cash" : "bank", date, note: `→ ${to.name}${note ? ` · ${note}` : ""}`, account: from._id },
    { owner: req.adminId, type: "income", amount: inAmt, currency: to.currency, amountUSD: usd, category: "transfer", method: to.kind === "cash" ? "cash" : "bank", date, note: `← ${from.name}${note ? ` · ${note}` : ""}`, account: to._id },
  ]);
  res.status(201).json(await accountsWithBalance(req));
});

// ---------------- Settings ----------------

async function getSettings(req) {
  let st = await FinanceSettings.findOne(own(req));
  if (!st) st = await FinanceSettings.create({ owner: req.adminId });
  return st;
}
exports.getSettings = wrap(async (req, res) => res.json(await getSettings(req)));
exports.updateSettings = wrap(async (req, res) => {
  const st = await getSettings(req);
  if (Array.isArray(req.body.receivableTeams)) st.receivableTeams = req.body.receivableTeams.map((x) => String(x).trim()).filter(Boolean);
  if (req.body.includeInvoices !== undefined) st.includeInvoices = Boolean(req.body.includeInvoices);
  if (Array.isArray(req.body.excludedInvoices)) {
    st.excludedInvoices = [...new Set(req.body.excludedInvoices.map(String))].filter((x) => mongoose.Types.ObjectId.isValid(x));
  }
  await st.save();
  res.json(st);
});

// ---------------- Owed to me (receivables) ----------------

// GET /api/finance/receivables
// Everything people owe me, in one place:
//   • students' unpaid fees on the teams I chose (settings.receivableTeams)
//     — read from the athletes' fee rows. Fee amounts are entered in US
//     dollars (the Debt report shows "$10 — Uniform fee"); here they're also
//     shown in Riel at KHR_PER_USD. Payments are
//     still collected through the Debt report as before
//   • unpaid / part-paid shop invoices (USD)
//   • money I lent that I recorded myself (Debts → owed to me)
exports.receivables = wrap(async (req, res) => res.json(await computeReceivables(req)));

async function computeReceivables(req) {
  const st = await getSettings(req);
  const teams = st.receivableTeams || [];

  let students = [];
  if (teams.length) {
    const athletes = await Athlete.find({ "assignments.team": { $in: teams }, "assignments.fees.0": { $exists: true } })
      .select("fullName khmerName photoUrl verifyId assignments")
      .lean();
    for (const a of athletes) {
      for (const as of a.assignments || []) {
        if (!teams.includes(as.team)) continue;
        const total = (as.fees || []).reduce((s, f) => s + (f.amount || 0), 0);
        if (total <= 0) continue;
        students.push({
          athleteId: a._id,
          assignmentId: as._id,
          fullName: a.fullName,
          khmerName: a.khmerName || "",
          photoUrl: a.photoUrl || null,
          team: as.team,
          role: as.role,
          fees: (as.fees || []).map((f) => ({ amount: f.amount, amountKHR: KHR_ROUND(f.amount), note: f.note, createdAt: f.createdAt })),
          totalKHR: KHR_ROUND(total),
          totalUSD: roundUSD(total),
        });
      }
    }
    students.sort((x, y) => y.totalKHR - x.totalKHR);
  }
  const byTeam = teams.map((tm) => {
    const rows = students.filter((s) => s.team === tm);
    return { team: tm, count: rows.length, totalKHR: rows.reduce((s, r) => s + r.totalKHR, 0) };
  });

  let invoices = [];
  const excluded = new Set((st.excludedInvoices || []).map(String));
  if (st.includeInvoices) {
    const list = await Invoice.find({ voided: false }).select("invoiceNo date customer total paidAmount").sort({ date: -1 }).lean();
    invoices = list
      .filter((i) => i.total - (i.paidAmount || 0) > 0.004)
      .map((i) => ({ _id: i._id, invoiceNo: i.invoiceNo, date: i.date, customer: i.customer, total: i.total, paid: i.paidAmount || 0, balanceUSD: roundUSD(i.total - (i.paidAmount || 0)), included: !excluded.has(String(i._id)) }));
  }
  const countedInvoices = invoices.filter((i) => i.included);

  const lent = (await FinanceDebt.find({ ...own(req), direction: "lend", closed: false })).map(debtView);

  const studentsUSD = roundUSD(students.reduce((s, r) => s + r.totalUSD, 0));
  const invoicesUSD = roundUSD(countedInvoices.reduce((s, r) => s + r.balanceUSD, 0));
  const lentUSD = roundUSD(lent.reduce((s, d) => s + d.remainingUSD, 0));
  return {
    rate: KHR_PER_USD,
    settings: st,
    students,
    byTeam,
    invoices,
    lent,
    totals: {
      studentsKHR: students.reduce((s, r) => s + r.totalKHR, 0),
      studentsUSD,
      invoicesUSD,
      invoicesCounted: countedInvoices.length,
      lentUSD,
      allUSD: roundUSD(studentsUSD + invoicesUSD + lentUSD),
    },
  };
}

// Used by the Telegram alerts (utils/telegramAlerts.js).
exports.helpers = { computeReceivables, accountsWithBalance, debtView, syncAutoPayments, nextAutoDate, dueInMonth, ymKey, toUSD, KHR_PER_USD };
