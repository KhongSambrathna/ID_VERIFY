// Cambodia administrative divisions (province → district → commune →
// village) with official NCDD codes, Khmer + English names. The data lives
// in data/cambodiaGazetteer.json (from the NCDD gazetteer via the MIT
// @sothikhorn/cambodia-gazetteer package, data dated 2024-10-14) — loaded
// once, no outside API call at runtime.
//
// Codes nest by length: province "17" → district "1701" → commune
// "170101" → village "17010101". So a code's district is always its first
// 4 digits, which is what the tournament "outside district" rule uses.
const data = require("../data/cambodiaGazetteer.json");

const LEVELS = ["province", "district", "commune", "village"];
const byCode = new Map();
data.provinces.forEach(([code, km, en]) => byCode.set(code, { code, km, en, level: "province" }));
[
  ["districts", "district"],
  ["communes", "commune"],
  ["villages", "village"],
].forEach(([key, level]) => {
  Object.values(data[key]).forEach((list) =>
    list.forEach(([code, km, en]) => byCode.set(code, { code, km, en, level }))
  );
});

const toItem = ([code, km, en]) => ({ code, km, en });

// Children of a code ("" or null → all provinces).
function getChildren(code) {
  if (!code) return data.provinces.map(toItem);
  const key = { 2: "districts", 4: "communes", 6: "villages" }[String(code).length];
  if (!key) return [];
  return (data[key][code] || []).map(toItem);
}

// The full chain for a code: { province, district, commune, village } —
// each { code, km, en } or null. Unknown code → null.
function lookup(code) {
  code = code ? String(code) : "";
  if (!byCode.has(code)) return null;
  const out = { province: null, district: null, commune: null, village: null };
  for (let len = 2; len <= code.length; len += 2) {
    const node = byCode.get(code.slice(0, len));
    if (node) out[node.level] = { code: node.code, km: node.km, en: node.en };
  }
  return out;
}

// District code (4 digits) of any province-level-or-deeper code, or null.
function districtOf(code) {
  code = code ? String(code) : "";
  return code.length >= 4 && byCode.has(code.slice(0, 4)) ? code.slice(0, 4) : null;
}

function name(code, lang = "km") {
  const node = byCode.get(String(code || ""));
  return node ? (lang === "en" ? node.en : node.km) : "";
}

module.exports = { LEVELS, getChildren, lookup, districtOf, name, isValid: (c) => byCode.has(String(c || "")) };
