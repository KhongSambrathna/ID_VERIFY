const crypto = require("crypto");

// Bakong Open API (National Bank of Cambodia) client.
// Base URL: https://api-bakong.nbc.gov.kh/  (overridable via BAKONG_API_BASE_URL)
// Auth: Bearer token (BAKONG_API_TOKEN env var).
//
// Typical payment flow:
//   1. createPayment({ amount, currency, ... })   →  { qr, md5, ... }
//   2. getQrImage({ qr, md5 })                    →  PNG Buffer (display to payer)
//   3. checkTransaction(md5)                      →  { responseCode, data: {...} }
//        responseCode 0 = paid, 1 = not yet paid / invalid md5
//
// Endpoint paths can be tuned via env vars to match your Bakong merchant portal docs.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — add it to the backend's environment variables`);
  }
  return value;
}

function baseUrl() {
  return (process.env.BAKONG_API_BASE_URL || "https://api-bakong.nbc.gov.kh/").replace(/\/$/, "");
}

function endpoint(name) {
  return process.env[name] || "";
}

// Generic POST with Bearer token auth. Returns parsed JSON body.
async function request(path, body) {
  const token = requireEnv("BAKONG_API_TOKEN");
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Bakong API: unreadable response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = new Error(
      `Bakong API error ${res.status}: ${data?.responseMessage || data?.message || text.slice(0, 200)}`
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Step 1 — Create a Bakong / KHQR payment.
// Returns { qr, md5, ... } from Bakong.
// currency: "USD" or "KHR" (defaults to USD).
// expirationTimestamp: minutes until the QR expires (default 15).
async function createPayment({
  amount,
  currency = "USD",
  orderInfo,
  merchantName,
  merchantCity,
  expirationTimestamp = 15,
} = {}) {
  const body = {
    amount: Number(amount).toFixed(2),
    currency,
    orderInfo: orderInfo || "Athlete fee payment",
    merchantName: merchantName || requireEnv("BAKONG_MERCHANT_NAME"),
    merchantCity: merchantCity || requireEnv("BAKONG_MERCHANT_CITY"),
    expirationTimestamp: Number(expirationTimestamp),
  };
  const path = endpoint("BAKONG_ENDPOINT_CREATE") || "/api/v1/payment/create";
  return request(path, body);
}

// Step 2 — Get the scannable QR image (PNG bytes).
// Returns a Buffer you can stream to the frontend or save to storage.
async function getQrImage({ qr, md5 }) {
  const token = requireEnv("BAKONG_API_TOKEN");
  const path = endpoint("BAKONG_ENDPOINT_QR_IMAGE") || "/api/v1/qr-image";
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ qr, md5 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Bakong QR image error ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

// Step 3 — Check whether a QR has been paid.
// md5 is the hash returned by createPayment.
// responseCode 0 = paid, 1 = not yet paid.
async function checkTransaction(md5) {
  const path = endpoint("BAKONG_ENDPOINT_CHECK") || "/api/v1/check-transaction";
  return request(path, { md5 });
}

module.exports = { createPayment, getQrImage, checkTransaction };
