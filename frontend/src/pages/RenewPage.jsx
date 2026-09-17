import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function needsRenewal(lastVerifiedAt) {
  return !lastVerifiedAt || Date.now() - new Date(lastVerifiedAt).getTime() > YEAR_MS;
}

// Its own page (not a column on the main roster table) specifically so it
// can list every person one-per-row regardless of how many teams they're
// on, and so renewing can be done one at a time, several selected at once,
// or all at once — the main dashboard table was getting too wide for this.
export default function RenewPage() {
  const { t } = useLanguage();
  const { isHeadCoach } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [onlyNeeding, setOnlyNeeding] = useState(true);
  const [renewingId, setRenewingId] = useState(null);
  const [bulkRenewing, setBulkRenewing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // GET /athletes returns one flattened row per team assignment; fold
      // that down to one row per person here since lastVerifiedAt is a
      // whole-person field, not per-team.
      const { data } = await api.get("/athletes");
      const byId = new Map();
      for (const a of data) {
        const existing = byId.get(a._id);
        if (existing) {
          if (a.team && !existing.teams.includes(a.team)) existing.teams.push(a.team);
        } else {
          byId.set(a._id, {
            _id: a._id,
            fullName: a.fullName,
            khmerName: a.khmerName,
            verifyId: a.verifyId,
            lastVerifiedAt: a.lastVerifiedAt,
            teams: a.team ? [a.team] : [],
          });
        }
      }
      setRows([...byId.values()].sort((x, y) => x.fullName.localeCompare(y.fullName)));
    } catch (err) {
      setError(err.response?.data?.message || t("renewPage.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => (onlyNeeding ? rows.filter((r) => needsRenewal(r.lastVerifiedAt)) : rows),
    [rows, onlyNeeding]
  );

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r._id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visible.forEach((r) => next.delete(r._id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((r) => next.add(r._id));
      return next;
    });
  };

  const renewOne = async (id) => {
    setRenewingId(id);
    try {
      await api.put(`/athletes/${id}/renew`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("renewPage.failedToRenew"));
    } finally {
      setRenewingId(null);
    }
  };

  const renewSelected = async () => {
    if (selected.size === 0) return;
    setBulkRenewing(true);
    try {
      await api.put("/athletes/bulk-renew", { athleteIds: [...selected] });
      setSelected(new Set());
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("renewPage.failedToRenewSelected"));
    } finally {
      setBulkRenewing(false);
    }
  };

  const renewAllVisible = async () => {
    if (visible.length === 0) return;
    if (!confirm(t("renewPage.confirmRenewAll").replace("{count}", visible.length))) return;
    setBulkRenewing(true);
    try {
      await api.put("/athletes/bulk-renew", { athleteIds: visible.map((r) => r._id) });
      setSelected(new Set());
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("renewPage.failedToRenew"));
    } finally {
      setBulkRenewing(false);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("renewPage.title")}</h2>
        <Link to={isHeadCoach ? "/coach" : "/admin"} className="link-btn">
          {t("renewPage.backToDashboard")}
        </Link>
      </div>
      <p className="help-text" style={{ maxWidth: 640 }}>
        {t("renewPage.helpText")}
      </p>

      <div className="dash-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={onlyNeeding} onChange={(e) => setOnlyNeeding(e.target.checked)} />
          {t("renewPage.onlyNeeding")}
        </label>
        <button className="btn btn-outline" onClick={renewAllVisible} disabled={bulkRenewing || visible.length === 0}>
          {bulkRenewing ? t("renewPage.renewing") : t("renewPage.renewAllListed").replace("{count}", visible.length)}
        </button>
        {selected.size > 0 && (
          <button className="btn btn-primary" onClick={renewSelected} disabled={bulkRenewing}>
            {bulkRenewing ? t("renewPage.renewing") : t("renewPage.renewSelectedBtn").replace("{count}", selected.size)}
          </button>
        )}
      </div>

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <th>{t("renewPage.colId")}</th>
                <th>{t("renewPage.colName")}</th>
                <th>{t("renewPage.colTeams")}</th>
                <th>{t("renewPage.colLastVerified")}</th>
                <th>{t("renewPage.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={() => toggleOne(r._id)}
                    />
                  </td>
                  <td data-label={t("renewPage.colId")}>{r.verifyId}</td>
                  <td data-label={t("renewPage.colName")}>
                    {r.fullName}
                    {r.khmerName && <span className="khmer-name"> {r.khmerName}</span>}
                  </td>
                  <td data-label={t("renewPage.colTeams")}>{r.teams.join(", ") || "—"}</td>
                  <td data-label={t("renewPage.colLastVerified")}>
                    {r.lastVerifiedAt ? new Date(r.lastVerifiedAt).toLocaleDateString() : t("renewPage.never")}
                    {needsRenewal(r.lastVerifiedAt) && (
                      <span className="badge rejected" style={{ marginLeft: 6 }}>
                        {t("renewPage.needsRenewal")}
                      </span>
                    )}
                  </td>
                  <td data-label={t("renewPage.colActions")} className="actions-cell">
                    <button
                      className="link-btn"
                      onClick={() => renewOne(r._id)}
                      disabled={renewingId === r._id}
                    >
                      {renewingId === r._id ? t("renewPage.renewing") : t("renewPage.renew")}
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                    {rows.length === 0 ? t("renewPage.noAthletesYet") : t("renewPage.noOneNeeds")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
