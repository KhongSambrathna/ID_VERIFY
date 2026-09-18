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
