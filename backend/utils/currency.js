// Every price/fee/payment amount in this app is stored in Khmer Riel (៛) —
// there's no fractional/cents unit in everyday use, so amounts are always
// rounded to the nearest whole Riel rather than the nearest cent (the old
// `Math.round(x * 100) / 100` pattern from when amounts were USD).
function roundKHR(amount) {
  return Math.round(Number(amount) || 0);
}

// For Telegram notification text (e.g. "paid ៛4,000 in cash") — matches the
// frontend's frontend/src/utils/currency.js formatKHR exactly, so a staff
// member sees the same number in a Telegram alert as on the dashboard.
function formatKHR(amount) {
  return `៛${roundKHR(amount).toLocaleString("en-US")}`;
}

module.exports = { roundKHR, formatKHR };
