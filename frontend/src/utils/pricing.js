// Same pricing rules as backend/utils/pricing.js:
//   • discountPercent (optionally between discountStart and discountEnd)
//   • wholesalePrice for wholesale customers, or for any order of at least
//     wholesaleMinQty units
// The lowest applicable price wins.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function discountActive(p, now = new Date()) {
  if (!(p?.discountPercent > 0)) return false;
  if (p.discountStart && now < new Date(p.discountStart)) return false;
  if (p.discountEnd && now > new Date(p.discountEnd)) return false;
  return true;
}

export function salePrice(p, now) {
  return discountActive(p, now) ? r2(p.price * (1 - p.discountPercent / 100)) : p.price;
}

// → { unitPrice, listPrice, reason: "" | "discount" | "wholesale" }
export function effectivePrice(p, qty = 1, wholesaleCustomer = false) {
  if (!p) return { unitPrice: 0, listPrice: 0, reason: "" };
  let best = salePrice(p);
  let reason = best < p.price ? "discount" : "";
  const wsOk = p.wholesalePrice > 0 && (wholesaleCustomer || (p.wholesaleMinQty > 0 && qty >= p.wholesaleMinQty));
  if (wsOk && p.wholesalePrice < best) {
    best = p.wholesalePrice;
    reason = "wholesale";
  }
  return { unitPrice: r2(best), listPrice: p.price, reason };
}
