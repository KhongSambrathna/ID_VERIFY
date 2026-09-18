const crypto = require("crypto");

// ABA PayWay (Cambodian payment gateway) — builds and signs requests for
// their Checkout API. Sandbox by default (ABA_PAYWAY_BASE_URL env var);
// switch it to https://checkout.payway.com.kh once the merchant account is
// approved for live payments — nothing else in this file changes. Docs:
// https://developer.payway.com.kh
//
// Every request ABA accepts is authenticated by a hash: HMAC-SHA512 of a
// fixed concatenation of fields, keyed with the merchant's API key,
// base64-encoded. The exact field order differs per endpoint — see each
// function below (copied verbatim from ABA's docs, not guessed).

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — add it to the backend's environment variables`);
  }
  return value;
}

// UTC, formatted exactly as PayWay expects: YYYYMMDDHHmmss.
function reqTimeNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function hmacSha512Base64(message, key) {
  return crypto.createHmac("sha512", key).update(message).digest("base64");
}

// tran_id must be <= 20 chars and unique per transaction — this is well
// under that with room to spare.
function generateTranId() {
  return `p${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.slice(0, 20);
}

// Builds the full set of form fields (including the hash) for a Purchase
// request. The caller does NOT call ABA directly with this — it hands the
// fields to the frontend, which submits them as a real browser <form> (POST,
// multipart/form-data) to `${ABA_PAYWAY_BASE_URL}/api/payment-gateway/v1/payments/purchase`.
// That redirects the payer to ABA's own hosted checkout page (KHQR + cards
// together), so our server and frontend never see card/QR details directly.
function buildPurchaseFields({ tranId, amount, firstname, lastname, email, phone, returnUrl }) {
  const merchantId = requireEnv("ABA_PAYWAY_MERCHANT_ID");
  const apiKey = requireEnv("ABA_PAYWAY_API_KEY");
  const reqTime = reqTimeNow();
  const currency = "USD";
  const items = Buffer.from(
    JSON.stringify([{ name: "Athlete fee payment", quantity: 1, price: Number(amount).toFixed(2) }])
  ).toString("base64");
  const returnUrlB64 = Buffer.from(returnUrl).toString("base64");

  const fields = {
    req_time: reqTime,
    merchant_id: merchantId,
    tran_id: tranId,
    amount: Number(amount).toFixed(2),
    items,
    shipping: "",
    firstname: firstname || "",
    lastname: lastname || "",
    email: email || "",
    phone: phone || "",
    type: "purchase",
    payment_option: "",
    return_url: returnUrlB64,
    cancel_url: "",
    continue_success_url: returnUrlB64,
    return_deeplink: "",
    currency,
    custom_fields: "",
    return_params: "",
    payout: "",
    lifetime: "",
    additional_params: "",
    google_pay_token: "",
    skip_success_page: "",
  };

  // Exact hash concatenation order per ABA's docs (view_type and
  // payment_gate are deliberately excluded from the hash).
  const hashString =
    fields.req_time +
    fields.merchant_id +
    fields.tran_id +
    fields.amount +
    fields.items +
    fields.shipping +
    fields.firstname +
    fields.lastname +
    fields.email +
    fields.phone +
    fields.type +
    fields.payment_option +
    fields.return_url +
    fields.cancel_url +
    fields.continue_success_url +
    fields.return_deeplink +
    fields.currency +
    fields.custom_fields +
    fields.return_params +
    fields.payout +
    fields.lifetime +
    fields.additional_params +
    fields.google_pay_token +
    fields.skip_success_page;

  return { ...fields, view_type: "hosted_view", hash: hmacSha512Base64(hashString, apiKey) };
}

// Server-to-server status check — this, not a redirect or an inbound
// webhook payload, is what our backend actually trusts before crediting a
// payment. Docs: 02-check-transaction.md.
async function checkTransaction(tranId) {
  const merchantId = requireEnv("ABA_PAYWAY_MERCHANT_ID");
  const apiKey = requireEnv("ABA_PAYWAY_API_KEY");
  const baseUrl = requireEnv("ABA_PAYWAY_BASE_URL");
  const reqTime = reqTimeNow();
  const hash = hmacSha512Base64(reqTime + merchantId + tranId, apiKey);

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/payment-gateway/v1/payments/check-transaction-2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ req_time: reqTime, merchant_id: merchantId, tran_id: tranId, hash }),
  });
  const body = await res.json().catch(() => null);
  if (!body) throw new Error("ABA PayWay: unreadable response from check-transaction");
  return body;
}

module.exports = { generateTranId, buildPurchaseFields, checkTransaction };
