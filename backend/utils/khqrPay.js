// KHQR payments for the shop.
//
//  1. makeQr()  — builds a KHQR string *locally* with the official
//     "bakong-khqr" package (amount, currency, order no, expiry). Any bank
//     app in Cambodia (ABA, ACLEDA, Wing, Bakong…) can scan and pay it.
//     md5 of that string is the payment's ID.
//  2. checkMd5s() — asks the Bakong Open API (National Bank of Cambodia)
//     whether those QR codes have been paid:
//        POST https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5_list
//     Needs a developer token (register at api-bakong.nbc.gov.kh). The
//     token lasts ~90 days; with an email saved it is renewed automatically
//     (POST /v1/renew_token) when Bakong answers 401.
//
// Note: Telegram does not let one bot read another bot's messages, so the
// bank's own Telegram bot notice can't be read by our bot — this API is how
// the payment is verified instead.
const crypto = require("crypto");
const QRCode = require("qrcode");
const { BakongKHQR, khqrData, IndividualInfo } = require("bakong-khqr");
const PaySettings = require("../models/PaySettings");

const apiBase = () => (process.env.BAKONG_API_BASE_URL || "https://api-bakong.nbc.gov.kh").replace(/\/$/, "");

async function getSettings() {
  let s = await PaySettings.findOne({ key: "shop" });
  if (!s) s = await PaySettings.create({ key: "shop" });
  // Env vars still work as a fallback (e.g. set on Render).
  if (!s.token && process.env.BAKONG_API_TOKEN) s.token = process.env.BAKONG_API_TOKEN;
  return s;
}

// Is KHQR payment switched on and complete enough to make QR codes?
const ready = (s) => Boolean(s && s.enabled && s.bakongAccountId);

// { qr, md5, amount, currency, expiresAt }
function makeQr(s, { amount, currency, billNumber }) {
  const cur = currency || s.currency || "USD";
  const amt = cur === "KHR" ? Math.round(Number(amount)) : Math.round(Number(amount) * 100) / 100;
  const expiresAt = new Date(Date.now() + (s.expiresMinutes || 15) * 60 * 1000);
  const info = new IndividualInfo(
    s.bakongAccountId,
    String(s.merchantName || "SHOP").slice(0, 25),
    String(s.merchantCity || "Phnom Penh").slice(0, 15),
    {
      currency: cur === "KHR" ? khqrData.currency.khr : khqrData.currency.usd,
      amount: amt,
      billNumber: String(billNumber || "").slice(0, 25),
      storeLabel: String(s.merchantName || "").slice(0, 25),
      expirationTimestamp: expiresAt.getTime(),
    }
  );
  const r = new BakongKHQR().generateIndividual(info);
  if (!r || !r.data || !r.data.qr) {
    const why = r?.status?.message || "invalid KHQR data";
    throw new Error(`Could not make the KHQR: ${why}`);
  }
  const md5 = r.data.md5 || crypto.createHash("md5").update(r.data.qr).digest("hex");
  return { qr: r.data.qr, md5, amount: amt, currency: cur, expiresAt };
}

// PNG image of a KHQR string, for Telegram sendPhoto.
const qrPng = (qr) => QRCode.toBuffer(qr, { type: "png", width: 600, margin: 2, errorCorrectionLevel: "M" });

async function post(s, path, body, retried) {
  if (!s.token) {
    const e = new Error("No Bakong API token — add it on the Telegram bot page (KHQR payments)");
    e.code = "NO_TOKEN";
    throw e;
  }
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    const e = new Error(`Can't reach the Bakong API (${err.message})`);
    e.code = "NETWORK";
    throw e;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (res.status === 401 && !retried && s.tokenEmail) {
    await renewToken(s);
    return post(s, path, body, true);
  }
  if (!res.ok) {
    const e = new Error(
      res.status === 401
        ? "Bakong token is wrong or expired — renew it (api-bakong.nbc.gov.kh) and paste the new one"
        : res.status === 403
          ? "Bakong API refused the request (403) — it may only accept calls from inside Cambodia"
          : `Bakong API error ${res.status}: ${data?.responseMessage || text.slice(0, 160)}`
    );
    e.code = `HTTP_${res.status}`;
    throw e;
  }
  return data;
}

// New token by email (Bakong emails nothing; the token comes back here).
async function renewToken(s) {
  const res = await fetch(`${apiBase()}/v1/renew_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: s.tokenEmail }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  const token = data?.data?.token;
  if (!res.ok || !token) throw new Error(`Bakong token renewal failed: ${data?.responseMessage || res.status}`);
  s.token = token;
  s.tokenRenewedAt = new Date();
  await PaySettings.updateOne({ _id: s._id }, { token, tokenRenewedAt: s.tokenRenewedAt });
  return token;
}

// md5 list (≤ 50) → Map(md5 → transaction) for the ones that are paid.
// A transaction: { hash, fromAccountId, toAccountId, currency, amount,
// description, createdDateMs, acknowledgedDateMs, … }
async function checkMd5s(s, md5s) {
  const out = new Map();
  const list = [...new Set(md5s)].slice(0, 50);
  if (!list.length) return out;
  const data = await post(s, "/v1/check_transaction_by_md5_list", list);
  for (const row of Array.isArray(data?.data) ? data.data : []) {
    if (row && row.status === "SUCCESS" && row.data) out.set(row.md5, row.data);
  }
  return out;
}

// One md5 → transaction or null.
async function checkMd5(s, md5) {
  const data = await post(s, "/v1/check_transaction_by_md5", { md5 });
  return data?.responseCode === 0 && data.data ? data.data : null;
}

// Look up by the bank's transaction hash (full 64 chars) — for /verify.
async function checkHash(s, hash) {
  const data = await post(s, "/v1/check_transaction_by_hash", { hash });
  return data?.responseCode === 0 && data.data ? data.data : null;
}

// Does this Bakong account exist? (settings test button)
async function accountExists(s, accountId) {
  const data = await post(s, "/v1/check_bakong_account", { accountId });
  return data?.responseCode === 0;
}

// The paid transaction really is for this payment (right account, amount, currency).
function matches(tx, payment, s) {
  if (!tx) return false;
  const sameCur = String(tx.currency || "").toUpperCase() === payment.currency;
  const sameAmt = Math.abs(Number(tx.amount) - Number(payment.amount)) < (payment.currency === "KHR" ? 1 : 0.01);
  const to = String(tx.toAccountId || "").toLowerCase();
  const sameTo = !to || to === String(s.bakongAccountId).toLowerCase();
  return sameCur && sameAmt && sameTo;
}

module.exports = { getSettings, ready, makeQr, qrPng, checkMd5s, checkMd5, checkHash, accountExists, renewToken, matches };
