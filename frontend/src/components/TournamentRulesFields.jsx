import { useEffect, useState } from "react";
import api from "../api/axios";
import AddressPicker from "./AddressPicker";
import { useLanguage } from "../i18n/LanguageContext";

// The extra tournament rules in the create/edit form: which teams may
// register, per-team squad size, outside-district limit, custom limited
// categories and written rules. All limits are per team (each team gets
// the same numbers). `teamLocked` = a Head Coach's own-team tournament, so
// the allowed-teams picker is hidden.
export default function TournamentRulesFields({ form, setForm, canPickTeams }) {
  const { t, language } = useLanguage();
  const [teams, setTeams] = useState([]);
  const [areaPick, setAreaPick] = useState("");
  const [areaNames, setAreaNames] = useState({}); // code → {km, en}

  useEffect(() => {
    if (!canPickTeams) return;
    api.get("/teams").then(({ data }) => setTeams(data)).catch(() => setTeams([]));
  }, [canPickTeams]);

  // Names for home-area chips that came from the server (editing).
  useEffect(() => {
    (form.homeAreas || []).forEach((a) => setAreaNames((m) => ({ ...m, [a.code]: a })));
  }, [form.homeAreas]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const update = (key) => (e) => set(key, e.target.value);

  const toggleTeam = (name) => {
    const cur = form.allowedTeams || [];
    set("allowedTeams", cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]);
  };

  const addArea = async () => {
    if (!areaPick || (form.homeAreaCodes || []).includes(areaPick)) return;
    try {
      const { data } = await api.get(`/geo/lookup/${areaPick}`);
      const node = areaPick.length === 4 ? data.district : data.province;
      setAreaNames((m) => ({ ...m, [areaPick]: node }));
    } catch {
      /* the chip just shows the code */
    }
    set("homeAreaCodes", [...(form.homeAreaCodes || []), areaPick]);
    setAreaPick("");
  };
  const areaLabel = (code) => {
    const n = areaNames[code];
    return n ? (language === "en" ? n.en : n.km) : code;
  };

  const cats = form.customCategories || [];
  const setCat = (i, key) => (e) => set("customCategories", cats.map((c, idx) => (idx === i ? { ...c, [key]: e.target.value } : c)));

  return (
    <>
      {canPickTeams && (
        <div className="field">
          <label>{t("tournamentRules.allowedTeamsLabel")}</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            {teams.map((tm) => (
              <label key={tm._id} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "normal" }}>
                <input
                  type="checkbox"
                  checked={(form.allowedTeams || []).includes(tm.name)}
                  onChange={() => toggleTeam(tm.name)}
                />
                {tm.name}
              </label>
            ))}
          </div>
          <p className="help-text">{t("tournamentRules.allowedTeamsHelp")}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>{t("tournamentRules.minPerTeam")}</label>
          <input type="number" min="0" value={form.minPlayersPerTeam} onChange={update("minPlayersPerTeam")} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t("tournamentRules.maxPerTeam")}</label>
          <input type="number" min="0" value={form.maxPlayersPerTeam} onChange={update("maxPlayersPerTeam")} />
        </div>
      </div>

      <div className="field">
        <label>{t("tournamentRules.homeAreaLabel")}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {(form.homeAreaCodes || []).map((code) => (
            <span key={code} className="badge" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {areaLabel(code)}
              <button
                type="button"
                className="link-btn"
                onClick={() => set("homeAreaCodes", form.homeAreaCodes.filter((c) => c !== code))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <AddressPicker depth={2} value={areaPick} onChange={({ code }) => setAreaPick(code)} />
        <button type="button" className="link-btn" onClick={addArea} disabled={!areaPick}>
          {t("tournamentRules.addAreaButton")}
        </button>
        <p className="help-text">{t("tournamentRules.homeAreaHelp")}</p>
      </div>
      {(form.homeAreaCodes || []).length > 0 && (
        <div className="field">
          <label>{t("tournamentRules.outsideSlotsLabel")}</label>
          <input type="number" min="0" value={form.outsideSlotsPerTeam} onChange={update("outsideSlotsPerTeam")} />
        </div>
      )}

      <div className="field">
        <label>{t("tournamentRules.categoriesLabel")}</label>
        {cats.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <input
              style={{ flex: 2, minWidth: 140 }}
              placeholder={t("tournamentRules.categoryNamePlaceholder")}
              value={c.label}
              onChange={setCat(i, "label")}
            />
            <span>{t("tournamentRules.categoryMaxPrefix")}</span>
            <input type="number" min="0" style={{ width: 80 }} value={c.maxPerTeam} onChange={setCat(i, "maxPerTeam")} />
            <span>{t("tournamentRules.categoryMaxSuffix")}</span>
            <button type="button" className="link-btn" onClick={() => set("customCategories", cats.filter((_, idx) => idx !== i))}>
              {t("common.remove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="link-btn"
          onClick={() => set("customCategories", [...cats, { key: "", label: "", maxPerTeam: "" }])}
        >
          {t("tournamentRules.addCategoryButton")}
        </button>
        <p className="help-text">{t("tournamentRules.categoriesHelp")}</p>
      </div>

      <div className="field">
        <label>{t("tournamentRules.rulesTextLabel")}</label>
        <textarea rows={4} value={form.rulesText} onChange={update("rulesText")} placeholder={t("tournamentRules.rulesTextPlaceholder")} />
      </div>
    </>
  );
}

// Form state → request body for the fields above.
export function rulesPayload(form, { canPickTeams }) {
  return {
    ...(canPickTeams ? { allowedTeams: form.allowedTeams || [] } : {}),
    maxPlayersPerTeam: form.maxPlayersPerTeam,
    minPlayersPerTeam: form.minPlayersPerTeam,
    homeAreaCodes: form.homeAreaCodes || [],
    outsideSlotsPerTeam: (form.homeAreaCodes || []).length ? form.outsideSlotsPerTeam : 0,
    customCategories: (form.customCategories || []).filter((c) => String(c.label || "").trim()),
    rulesText: form.rulesText || "",
  };
}

export const emptyRules = {
  allowedTeams: [],
  maxPlayersPerTeam: "",
  minPlayersPerTeam: "",
  homeAreaCodes: [],
  homeAreas: [],
  outsideSlotsPerTeam: "",
  customCategories: [],
  rulesText: "",
};

export function rulesFromTournament(tour) {
  return {
    allowedTeams: tour.allowedTeams || [],
    maxPlayersPerTeam: tour.maxPlayersPerTeam ? String(tour.maxPlayersPerTeam) : "",
    minPlayersPerTeam: tour.minPlayersPerTeam ? String(tour.minPlayersPerTeam) : "",
    homeAreaCodes: (tour.homeAreas || []).map((a) => a.code),
    homeAreas: tour.homeAreas || [],
    outsideSlotsPerTeam: tour.outsideSlotsPerTeam ? String(tour.outsideSlotsPerTeam) : "",
    customCategories: (tour.customCategories || []).map((c) => ({
      key: c.key,
      label: c.label,
      maxPerTeam: c.maxPerTeam ? String(c.maxPerTeam) : "",
    })),
    rulesText: tour.rulesText || "",
  };
}

// Short lines describing the extra rules, for the tournament lists.
export function rulesSummaryLines(tour, t, language) {
  const lines = [];
  if ((tour.allowedTeams || []).length) lines.push(t("tournamentRules.sumTeams").replace("{teams}", tour.allowedTeams.join(", ")));
  if (tour.minPlayersPerTeam || tour.maxPlayersPerTeam) {
    lines.push(
      t("tournamentRules.sumSquad")
        .replace("{min}", tour.minPlayersPerTeam || "—")
        .replace("{max}", tour.maxPlayersPerTeam || "—")
    );
  }
  if ((tour.homeAreas || []).length) {
    lines.push(
      t("tournamentRules.sumOutside")
        .replace("{areas}", tour.homeAreas.map((a) => (language === "en" ? a.en : a.km) || a.code).join(", "))
        .replace("{slots}", tour.outsideSlotsPerTeam || 0)
    );
  }
  (tour.customCategories || []).forEach((c) => {
    lines.push(
      c.maxPerTeam
        ? t("tournamentRules.sumCategory").replace("{label}", c.label).replace("{max}", c.maxPerTeam)
        : c.label
    );
  });
  return lines;
}
