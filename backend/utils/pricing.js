// Product pricing rules (shop prices are in US dollars):
//   • discountPercent — a sale on the product (e.g. 10 = 10% off), optionally
//     only between discountStart and discountEnd
//   • wholesalePrice  — price per unit for wholesale customers, or for anyone
//     buying at least wholesaleMinQty units at once
// The lowest applicable price wins. The same rules run in the browser
// (frontend/src/utils/pricing.js) so forms show the price the server will use.
const { roundUSD } = require("./currency");

function discountActive(p, now = new Date()) {
  if (!(p.discountPercent > 0)) return false;
  if (p.discountStart && now < new Date(p.discountStart)) return false;
  if (p.discountEnd && now > new Date(p.discountEnd)) return false;
  return true;
}

function salePrice(p, now) {
  return discountActive(p, now) ? roundUSD(p.price * (1 - p.discountPercent / 100)) : p.price;
}

function wholesaleApplies(p, qty, wholesaleCustomer) {
  if (!(p.wholesalePrice > 0)) return false;
  if (wholesaleCustomer) return true;
  return p.wholesaleMinQty > 0 && qty >= p.wholesaleMinQty;
}

// → { unitPrice, listPrice, reason: "" | "discount" | "wholesale" }
function effectivePrice(p, qty = 1, wholesaleCustomer = false, now = new Date()) {
  const list = p.price;
  let best = salePrice(p, now);
  let reason = best < list ? "discount" : "";
  if (wholesaleApplies(p, qty, wholesaleCustomer) && p.wholesalePrice < best) {
    best = p.wholesalePrice;
    reason = "wholesale";
  }
  return { unitPrice: roundUSD(best), listPrice: list, reason };
}

module.exports = { discountActive, salePrice, effectivePrice };
