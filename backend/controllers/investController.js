const mongoose = require("mongoose");
const { FinanceInvestment, FinanceInvestEntry, FinanceTxn, FinanceAccount } = require("../models/Finance");
const { roundUSD } = require("../utils/currency");

// Investments / betting pots for the signed-in Admin (private, like the
// rest of personal finance). Daily results (win + / loss −), money moved in
// and out (optionally from/to one of my accounts), honest totals.
const RATE = 4000;
const TZ = "Asia/Phnom_Penh";
const TZ_OFFSET = "+07:00";
const own = (req) => ({ owner: req.adminId });
const toUSD = (n, cur) => roundUSD(cur === "KHR" ? n / RATE : n);
const r2 = (n, cur) => (cur === "KHR" ? Math.round(n) : roundUSD(n));
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const ym = (d) => ymd(d).slice(0, 7);
function day(str) {
  if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T12:00:00${TZ_OFFSET}`);
  return new Date();
}
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};
const bad = (res, m) => res.status(400).json({ message: m });

// Totals for one pot from its entries.
function stats(inv, entries, now = new Date()) {
  const cur = inv.currency;
  const thisMonth = ym(now);
  const today = ymd(now);
  let deposits = 0, withdrawals = 0, pnl = 0, monthPnl = 0, todayPnl = 0, staked = 0, monthStaked = 0, todayStaked = 0;
  const byDay = new Map(); // ymd → result total
  for (const e of entries) {
    if (e.type === "deposit") deposits += e.amount;
    else if (e.type === "withdraw") withdrawals += e.amount;
    else {
      pnl += e.amount;
      staked += e.stake || 0;
      const d = ymd(e.date);
      byDay.set(d, (byDay.get(d) || 0) + e.amount);
      if (d.startsWith(thisMonth)) {
        monthPnl += e.amount;
        monthStaked += e.stake || 0;
      }
      if (d === today) {
        todayPnl += e.amount;
        todayStaked += e.stake || 0;
      }
    }
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const winDays = days.filter(([, v]) => v > 0).length;
  const lossDays = days.filter(([, v]) => v < 0).length;
  // Longest run of losing days in a row, and the current run.
  let worstRun = 0, run = 0;
  for (const [, v] of days) {
    run = v < 0 ? run + 1 : 0;
    worstRun = Math.max(worstRun, run);
  }
  let bestDay = null, worstDay = null;
  for (const [d, v] of days) {
    if (!bestDay || v > bestDay.amount) bestDay = { date: d, amount: r2(v, cur) };
    if (!worstDay || v < worstDay.amount) worstDay = { date: d, amount: r2(v, cur) };
  }
  const monthLoss = Math.max(-monthPnl, 0);
  return {
    balance: r2(deposits - withdrawals + pnl, cur),
    deposits: r2(deposits, cur),
    withdrawals: r2(withdrawals, cur),
    netPutIn: r2(deposits - withdrawals, cur), // my own money still inside
    pnl: r2(pnl, cur),
    pnlUSD: toUSD(pnl, cur),
    monthPnl: r2(monthPnl, cur),
    monthPnlUSD: toUSD(monthPnl, cur),
    todayPnl: r2(todayPnl, cur),
    todayStaked: r2(todayStaked, cur),
    staked: r2(staked, cur),
    monthStaked: r2(monthStaked, cur),
    roi: staked > 0 ? Math.round((pnl / staked) * 1000) / 10 : null, // % of what was bet
    winDays,
    lossDays,
    winRate: winDays + lossDays ? Math.round((winDays / (winDays + lossDays)) * 100) : null,
    worstRun,
    currentLossRun: run,
    bestDay,
    worstDay,
    monthLoss: r2(monthLoss, cur),
    overMonthlyLimit: inv.monthlyLossLimit > 0 && monthLoss >= inv.monthlyLossLimit,
    nearMonthlyLimit: inv.monthlyLossLimit > 0 && monthLoss >= inv.monthlyLossLimit * 0.8,
    overDailyStake: inv.dailyStakeLimit > 0 && todayStaked > inv.dailyStakeLimit,
  };
}

async function view(inv) {
  const entries = await FinanceInvestEntry.find({ investment: inv._id }).lean();
  return { ...(inv.toObject ? inv.toObject() : inv), stats: stats(inv, entries), entryCount: entries.length };
}

// GET /api/finance/invest
exports.list = wrap(async (req, res) => {
  const list = await FinanceInvestment.find(own(req)).sort({ archived: 1, createdAt: 1 }).lean();
  const views = await Promise.all(list.map(view));
  const active = views.filter((v) => !v.archived);
  res.json({
    investments: views,
    totals: {
      pnlUSD: roundUSD(active.reduce((s, v) => s + v.stats.pnlUSD, 0)),
      monthPnlUSD: roundUSD(active.reduce((s, v) => s + v.stats.monthPnlUSD, 0)),
      todayPnlUSD: roundUSD(active.reduce((s, v) => s + toUSD(v.stats.todayPnl, v.currency), 0)),
      balanceUSD: roundUSD(active.reduce((s, v) => s + toUSD(v.stats.balance, v.currency), 0)),
      netPutInUSD: roundUSD(active.reduce((s, v) => s + toUSD(v.stats.netPutIn, v.currency), 0)),
    },
  });
});

function readInv(body, inv) {
  if (body.name !== undefined) inv.name = String(body.name).trim();
  if (body.kind !== undefined) inv.kind = ["betting", "gold", "crypto", "stock", "business", "other"].includes(body.kind) ? body.kind : "other";
  if (body.currency !== undefined && inv.isNew) inv.currency = body.currency === "KHR" ? "KHR" : "USD";
  if (body.note !== undefined) inv.note = String(body.note).trim();
  for (const k of ["monthlyLossLimit", "dailyStakeLimit"]) {
    if (body[k] === undefined) continue;
    const v = body[k] === "" ? 0 : Number(body[k]);
    if (!Number.isFinite(v) || v < 0) return "Enter valid limits";
    inv[k] = v;
  }
  if (body.archived !== undefined) inv.archived = Boolean(body.archived);
  if (!inv.name) return "Enter a name";
  return null;
}

exports.create = wrap(async (req, res) => {
  const inv = new FinanceInvestment({ owner: req.adminId, name: "" });
  const err = readInv(req.body, inv);
  if (err) return bad(res, err);
  await inv.save();
  res.status(201).json(await view(inv));
});

exports.update = wrap(async (req, res) => {
  const inv = await FinanceInvestment.findOne({ _id: req.params.id, ...own(req) });
  if (!inv) return res.status(404).json({ message: "Not found" });
  const err = readInv(req.body, inv);
  if (err) return bad(res, err);
  await inv.save();
  res.json(await view(inv));
});

exports.remove = wrap(async (req, res) => {
  const inv = await FinanceInvestment.findOne({ _id: req.params.id, ...own(req) });
  if (!inv) return res.status(404).json({ message: "Not found" });
  const entries = await FinanceInvestEntry.find({ investment: inv._id, txn: { $ne: null } }).select("txn");
  await FinanceTxn.deleteMany({ _id: { $in: entries.map((e) => e.txn) }, ...own(req) });
  await FinanceInvestEntry.deleteMany({ investment: inv._id });
  await inv.deleteOne();
  res.json({ message: "Deleted" });
});

// GET /api/finance/invest/:id/entries?month=YYYY-MM
exports.entries = wrap(async (req, res) => {
  const inv = await FinanceInvestment.findOne({ _id: req.params.id, ...own(req) }).lean();
  if (!inv) return res.status(404).json({ message: "Not found" });
  const all = await FinanceInvestEntry.find({ investment: inv._id }).sort({ date: 1, createdAt: 1 }).lean();
  const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : ym(new Date());
  // Daily results for the month (one bar per day)
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, "0")}`, pnl: 0 }));
  for (const e of all) {
    if (e.type !== "result") continue;
    const d = ymd(e.date);
    if (!d.startsWith(month)) continue;
    daily[Number(d.slice(8)) - 1].pnl += e.amount;
  }
  daily.forEach((d) => (d.pnl = r2(d.pnl, inv.currency)));
  // Running profit/loss from the first entry
  const cum = [];
  let run = 0;
  for (const e of all) {
    if (e.type !== "result") continue;
    run += e.amount;
    const d = ymd(e.date);
    if (cum.length && cum[cum.length - 1].date === d) cum[cum.length - 1].pnl = r2(run, inv.currency);
    else cum.push({ date: d, pnl: r2(run, inv.currency) });
  }
  res.json({
    investment: { ...inv, stats: stats(inv, all) },
    month,
    entries: all.filter((e) => ym(e.date) === month).reverse(),
    daily,
    cumulative: cum,
  });
});

// POST /api/finance/invest/:id/entries
//   { type: "result", amount (+win / −loss) | win: bool + amount, stake?, date?, note? }
//   { type: "deposit" | "withdraw", amount, date?, note?, account? }
exports.addEntry = wrap(async (req, res) => {
  const inv = await FinanceInvestment.findOne({ _id: req.params.id, ...own(req) });
  if (!inv) return res.status(404).json({ message: "Not found" });
  const type = req.body.type;
  if (!["result", "deposit", "withdraw"].includes(type)) return bad(res, "Choose result, deposit or withdraw");
  let amount = Number(req.body.amount);
  if (!Number.isFinite(amount)) return bad(res, "Enter an amount");
  if (type === "result") {
    if (req.body.win !== undefined) amount = Math.abs(amount) * (req.body.win ? 1 : -1);
  } else {
    if (!(amount > 0)) return bad(res, "Enter an amount greater than 0");
  }
  amount = r2(amount, inv.currency);
  const stake = type === "result" ? Math.max(Number(req.body.stake) || 0, 0) : 0;
  const date = day(req.body.date);
  const note = String(req.body.note || "").trim();
  const e = new FinanceInvestEntry({
    owner: req.adminId,
    investment: inv._id,
    type,
    amount,
    amountUSD: toUSD(amount, inv.currency),
    stake: r2(stake, inv.currency),
    date,
    note,
  });
  // Money moved between one of my accounts and this pot: shown in the
  // daily log and moves the account balance, but isn't income/spending.
  if (type !== "result" && req.body.account) {
    if (!mongoose.isValidObjectId(req.body.account)) return bad(res, "Invalid account");
    const acc = await FinanceAccount.findOne({ _id: req.body.account, ...own(req) });
    if (!acc) return bad(res, "Account not found");
    const t = await FinanceTxn.create({
      owner: req.adminId,
      type: type === "deposit" ? "expense" : "income",
      amount,
      currency: inv.currency,
      amountUSD: toUSD(amount, inv.currency),
      category: "invest",
      method: acc.kind === "cash" ? "cash" : "bank",
      date,
      note: `${type === "deposit" ? "→" : "←"} ${inv.name}${note ? ` · ${note}` : ""}`,
      account: acc._id,
    });
    e.txn = t._id;
  }
  await e.save();
  const all = await FinanceInvestEntry.find({ investment: inv._id }).lean();
  res.status(201).json({ entry: e, stats: stats(inv, all) });
});

exports.removeEntry = wrap(async (req, res) => {
  const e = await FinanceInvestEntry.findOne({ _id: req.params.entryId, investment: req.params.id, ...own(req) });
  if (!e) return res.status(404).json({ message: "Not found" });
  if (e.txn) await FinanceTxn.deleteOne({ _id: e.txn, ...own(req) });
  await e.deleteOne();
  res.json({ message: "Deleted" });
});

exports.stats = stats;
