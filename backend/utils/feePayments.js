// KHQR payments for student debts (owed fees) and tournament entry fees.
//
//   staff / player presses "pay by KHQR" → createFeeQr / createTournamentQr
//   makes a KHQR in US dollars for what's owed (student money is kept in
//   dollars) and saves a PENDING Payment →
//   the student scans it with any bank app → runFeeChecks() (every ~20 s,
//   and whenever the payment page asks) checks with the Bakong API →
//   paid: the debt is reduced (or the entry fee marked paid), the Payment
//   becomes COMPLETED, and Admins, the team's coaches, the payment group
//   and the student's own linked Telegram are told.
//
// Uses the same settings as the shop (Telegram bot page → 💳 KHQR):
// Bakong account ID + Bakong API token.
const Athlete = require("../models/Athlete");
const Admin = require("../models/Admin");
const Payment = require("../models/Payment");
const Tournament = require("../models/Tournament");
const pay = require("./khqrPay");
const { tg, esc } = require("./telegramApi");

const GRACE_MS = 10 * 60 * 1000;
const RATE = 4000;
const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
// "$5.00 (≈ ៛20,000)"
const money = (n) => `$${cents(n).toFixed(2)} (≈ ៛${(Math.round((cents(n) * RATE) / 100) * 100).toLocaleString("en-US")})`;
const feeOwedOf = (assignment) => Math.round((assignment.fees || []).reduce((sum, f) => sum + (f.amount || 0), 0) * 100) / 100;
const send = (chatId, text) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });

function notReady() {
  const e = new Error("KHQR payments are not set up yet — Admin: Telegram bot page → 💳 KHQR (Bakong account ID)");
  e.status = 400;
  return e;
}

async function newQr({ amount, billNumber, currency = "USD" }) {
  const s = await pay.getSettings();
  if (!s.bakongAccountId) throw notReady();
  // Student debts are kept in US dollars; a tournament's entry fee is in
  // that tournament's own currency (riel or dollars).
  return currency === "KHR"
    ? pay.makeQr(s, { amount: Math.round(amount), currency: "KHR", billNumber })
    : pay.makeQr(s, { amount: cents(amount), currency: "USD", billNumber });
}
const khr = (n) => `៛${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
// Payment amount in its own currency.
const moneyIn = (n, cur) => (cur === "KHR" ? `${khr(n)} (≈ $${cents(n / RATE).toFixed(2)})` : money(n));

// Debt: pay (part of) what's owed on one team assignment.
async function createFeeQr({ athlete, assignment, amount, by }) {
  const owed = feeOwedOf(assignment);
  amount = cents(amount ?? owed);
  if (!Number.isFinite(amount) || amount < 0.01) throw Object.assign(new Error("Amount must be at least $0.01"), { status: 400 });
  if (amount > cents(owed) + 0.001) throw Object.assign(new Error("Amount is more than what's currently owed"), { status: 400 });
  const q = await newQr({ amount, billNumber: `FEE-${athlete.verifyId || String(athlete._id).slice(-6)}` });
  return Payment.create({
    athlete: athlete._id,
    kind: "FEE",
    assignmentId: assignment._id,
    team: assignment.team,
    amount: q.amount,
    currency: "USD",
    method: "BAKONG",
    status: "PENDING",
    reference: q.md5,
    qr: q.qr,
    expiresAt: q.expiresAt,
    label: `${athlete.fullName} · ${assignment.team}`,
    recordedBy: by || undefined,
    note: "KHQR",
  });
}

// Tournament entry fee still unpaid on one registration.
async function createTournamentQr({ tournament, row, by }) {
  if (row.convertedToDebt) {
    throw Object.assign(new Error("This entry fee has already moved to the student's debts — pay it from the debts instead"), { status: 409 });
  }
  const currency = Tournament.feeCurrency(tournament);
  const left = (tournament.entryFee || 0) - (row.feePaidAmount || 0);
  const amount = currency === "KHR" ? Math.round(left) : cents(left);
  if (amount < (currency === "KHR" ? 100 : 0.01)) throw Object.assign(new Error("Nothing left to pay for this entry fee"), { status: 400 });
  const q = await newQr({ amount, currency, billNumber: `TR-${String(row._id).slice(-8)}` });
  return Payment.create({
    athlete: row.athlete,
    kind: "TOURNAMENT",
    tournament: tournament._id,
    registrationId: row._id,
    team: row.team,
    amount: q.amount,
    currency,
    method: "BAKONG",
    status: "PENDING",
    reference: q.md5,
    qr: q.qr,
    expiresAt: q.expiresAt,
    label: `${row.fullName} · ${row.team} · ${tournament.name}`,
    recordedBy: by || undefined,
    note: "KHQR entry fee",
  });
}

// Reduce owed fee rows oldest-first by `amount`.
async function reduceFees(athlete, assignment, amount) {
  let remaining = amount;
  const sorted = [...assignment.fees].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  for (const fee of sorted) {
    if (remaining <= 0) break;
    if (fee.amount <= remaining) {
      remaining -= fee.amount;
      assignment.fees = assignment.fees.filter((f) => String(f._id) !== String(fee._id));
    } else {
      fee.amount = cents(fee.amount - remaining);
      remaining = 0;
    }
  }
  await athlete.save();
  return feeOwedOf(assignment);
}

// Paid → apply it once (safe if two checks find it together) and tell people.
async function applyPaid(paymentId, { tx = null, by = null } = {}) {
  const p = await Payment.findOneAndUpdate(
    { _id: paymentId, status: { $in: ["PENDING", "EXPIRED"] } },
    {
      $set: {
        status: "COMPLETED",
        paidAt: tx?.acknowledgedDateMs ? new Date(tx.acknowledgedDateMs) : new Date(),
        paidHash: tx?.hash || "",
        fromAccount: tx?.fromAccountId || "",
        ...(by ? { recordedBy: by } : {}),
      },
    },
    { new: true }
  );
  if (!p) return { already: true };

  const athlete = await Athlete.findById(p.athlete);
  let what = "";
  let left = null;
  let leftCur = "USD";
  if (p.kind === "TOURNAMENT") {
    const t = await Tournament.findById(p.tournament);
    const row = t && t.registrations.id(p.registrationId);
    if (row && !row.convertedToDebt) {
      const paidNow = (row.feePaidAmount || 0) + p.amount;
      row.feePaidAmount = p.currency === "KHR" ? Math.round(Math.min(t.entryFee, paidNow)) : cents(Math.min(t.entryFee, paidNow));
      row.feePaid = row.feePaidAmount >= t.entryFee && t.entryFee > 0;
      row.feePaidAt = new Date();
      row.feePaidBy = by || row.feePaidBy || null;
      await t.save();
      left = Math.max(0, t.entryFee - row.feePaidAmount);
      leftCur = p.currency;
    } else if (row && athlete) {
      // Moved to debts meanwhile → pay the debt instead.
      const asg = athlete.assignments.find((a) => a.team === row.team);
      // Debts are in dollars — convert a riel payment first.
      const usdAmount = p.currency === "KHR" ? cents(p.amount / RATE) : p.amount;
      if (asg) left = await reduceFees(athlete, asg, Math.min(usdAmount, feeOwedOf(asg)));
    }
    what = `ថ្លៃចូលរួម ${t ? esc(t.name) : "ពាន"}`;
  } else if (athlete) {
    const asg = athlete.assignments.id(p.assignmentId);
    if (asg) left = await reduceFees(athlete, asg, Math.min(p.amount, feeOwedOf(asg)));
    what = "បំណុល";
  }

  const name = athlete ? athlete.fullName : p.label;
  // What's still owed: a tournament fee in its own currency, a debt in dollars.
  const leftText = (n) => (leftCur === "KHR" ? moneyIn(n, "KHR") : money(n));
  const text =
    `💰 <b>បានទទួលលុយ ${moneyIn(p.amount, p.currency)}</b> (KHQR)\n👤 ${esc(name)} · ${esc(p.team)}\n🧾 ${what}` +
    (left !== null ? `\n📉 នៅជំពាក់ ${leftText(left)}` : "") +
    (p.fromAccount ? `\n↪️ ពី ${esc(p.fromAccount)}` : "") +
    (by ? "\n✍️ កត់ដោយដៃ" : "\n🏦 ផ្ទៀងផ្ទាត់ជាមួយ Bakong");

  // Admins, the team's coaches, the payment group, and the student.
  const s = await pay.getSettings();
  const staff = await Admin.find({
    $or: [{ role: "ADMIN" }, { role: "HEAD_COACH", team: p.team }],
    telegramChatId: { $nin: ["", null] },
  }).select("telegramChatId");
  const sent = new Set();
  const to = (id) => {
    if (!id || sent.has(String(id))) return null;
    sent.add(String(id));
    return send(id, text);
  };
  for (const a of staff) await to(a.telegramChatId);
  if (s.groupChatId) await to(s.groupChatId);
  if (athlete) {
    const own = await Admin.find({ athleteId: athlete._id, telegramChatId: { $nin: ["", null] } }).select("telegramChatId");
    for (const a of own) {
      if (sent.has(String(a.telegramChatId))) continue;
      sent.add(String(a.telegramChatId));
      await send(a.telegramChatId, `✅ <b>បានទទួលការបង់ប្រាក់ ${moneyIn(p.amount, p.currency)}</b>\n🧾 ${what}${left !== null ? `\n📉 នៅជំពាក់ ${leftText(left)}` : ""}\n\nសូមអរគុណ! 🙏`);
    }
  }
  return { payment: p, left };
}

// Ask Bakong about pending fee QR codes (or just these). Old ones expire.
let running = false;
async function runFeeChecks({ ids = null } = {}) {
  if (running && !ids) return { skipped: true };
  if (!ids) running = true;
  const result = { checked: 0, paid: [], expired: 0, error: "" };
  try {
    const filter = { method: "BAKONG", status: "PENDING", reference: { $nin: ["", null] }, qr: { $nin: ["", null] } };
    if (ids) filter._id = { $in: ids };
    const list = await Payment.find(filter).limit(200);
    if (!list.length) return result;
    const s = await pay.getSettings();
    if (s.token) {
      for (let i = 0; i < list.length; i += 50) {
        const batch = list.slice(i, i + 50);
        let paidMap;
        try {
          paidMap = await pay.checkMd5s(s, batch.map((p) => p.reference));
        } catch (err) {
          result.error = err.message;
          break;
        }
        result.checked += batch.length;
        for (const p of batch) {
          const tx = paidMap.get(p.reference);
          if (tx && pay.matches(tx, { amount: p.amount, currency: p.currency }, s)) {
            await applyPaid(p._id, { tx });
            result.paid.push(String(p._id));
          }
        }
      }
    }
    for (const p of list) {
      if (result.paid.includes(String(p._id))) continue;
      if (p.expiresAt && Date.now() > new Date(p.expiresAt).getTime() + GRACE_MS) {
        await Payment.updateOne({ _id: p._id, status: "PENDING" }, { $set: { status: "EXPIRED" } });
        result.expired += 1;
      }
    }
    return result;
  } finally {
    if (!ids) running = false;
  }
}

module.exports = { createFeeQr, createTournamentQr, applyPaid, runFeeChecks, feeOwedOf };
