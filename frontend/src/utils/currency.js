// Every price/fee/payment amount in this app is stored and entered in
// Khmer Riel (៛) — there's no fractional/cents unit in everyday use, so
// amounts are always whole numbers. This is the one place that turns a
// plain number into the "៛4,000" text shown across fees, payments, the
// debt report, tournaments, subscriptions, and the shop — change the
// symbol or thousand-separator style here and it updates everywhere.
export function formatKHR(amount) {
  const n = Math.round(Number(amount) || 0);
  return `៛${n.toLocaleString("en-US")}`;
}

// Shop products (selling price, buying cost, purchases, sales, profit) are
// priced in US dollars — "$12.50". Fees, payments etc. stay in Riel above.
export function formatUSD(amount) {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shop prices are set in dollars, but most buyers think in Riel — show the
// approximate Riel next to them: "$1.75 ≈ ៛7,000". Rounded to the nearest
// ៛100 (the smallest note in everyday use). Change USD_TO_KHR if the rate moves.
export const USD_TO_KHR = 4000;
export function approxKHR(usd) {
  const riel = Math.round(((Number(usd) || 0) * USD_TO_KHR) / 100) * 100;
  return `≈ ៛${riel.toLocaleString("en-US")}`;
}
export function formatUSDwithKHR(usd) {
  return `${formatUSD(usd)} ${approxKHR(usd)}`;
}
