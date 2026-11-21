import { useEffect, useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Cascading province → district → commune → village picker (Cambodia NCDD
// codes, served by GET /api/geo — see backend/utils/gazetteer.js).
// `value` is the deepest code picked so far ("" = nothing). `onChange`
// gets ({ code, text }) — `text` is a ready-made Khmer address line built
// from the pick, for filling in the free-text address field.
const LEVELS = [
  { len: 2, labelKey: "addressPicker.province" },
  { len: 4, labelKey: "addressPicker.district" },
  { len: 6, labelKey: "addressPicker.commune" },
  { len: 8, labelKey: "addressPicker.village" },
];

// Module-level cache: lists never change, and several pickers can be open.
const cache = new Map();
async function loadChildren(parent) {
  const key = parent || "";
  if (!cache.has(key)) {
    cache.set(
      key,
      api.get(parent ? `/geo/children/${parent}` : "/geo/children").then((r) => r.data).catch((err) => {
        cache.delete(key);
        throw err;
      })
    );
  }
  return cache.get(key);
}

export function buildAddressText(chain) {
  // chain: [{km}, ...] province first. Written village first, Khmer style.
  const [p, d, c, v] = chain;
  const parts = [];
  if (v) parts.push(`ភូមិ${v.km}`);
  if (c) parts.push(c.km);
  if (d) parts.push(d.km);
  if (p) parts.push(p.km);
  return parts.join(", ");
}

// `depth` limits how many levels are shown (2 = province + district).
export default function AddressPicker({ value, onChange, disabled, depth = 4 }) {
  const { t, language } = useLanguage();
  const code = value ? String(value) : "";
  // lists[i] = options for level i (i=0 provinces).
  const [lists, setLists] = useState([[], [], [], []]);
  const [error, setError] = useState("");

  // Reload every list the current code needs whenever it changes.
  useEffect(() => {
    let cancelled = false;
    const parents = ["", code.slice(0, 2), code.slice(0, 4), code.slice(0, 6)];
    Promise.all(
      parents.map((p, i) =>
        i < depth && (i === 0 || code.length >= LEVELS[i - 1].len) ? loadChildren(p) : Promise.resolve([])
      )
    )
      .then((res) => !cancelled && (setLists(res), setError("")))
      .catch(() => !cancelled && setError(t("addressPicker.loadFailed")));
    return () => {
      cancelled = true;
    };
  }, [code, depth]);

  const pick = (levelIndex) => (e) => {
    const picked = e.target.value;
    const next = picked || (levelIndex > 0 ? code.slice(0, LEVELS[levelIndex - 1].len) : "");
    const chain = LEVELS.map((lv, i) => {
      if (next.length < lv.len) return null;
      return lists[i].find((o) => o.code === next.slice(0, lv.len)) || null;
    });
    onChange({ code: next, text: buildAddressText(chain) });
  };

  return (
    <div className="address-picker" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
      {LEVELS.slice(0, depth).map((lv, i) => {
        const enabled = i === 0 || code.length >= LEVELS[i - 1].len;
        const selected = code.length >= lv.len ? code.slice(0, lv.len) : "";
        return (
          <select key={lv.len} value={selected} onChange={pick(i)} disabled={disabled || !enabled}>
            <option value="">— {t(lv.labelKey)} —</option>
            {lists[i].map((o) => (
              <option key={o.code} value={o.code}>
                {language === "en" ? o.en : o.km}
              </option>
            ))}
          </select>
        );
      })}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
