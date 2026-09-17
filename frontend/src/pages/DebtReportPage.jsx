import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

// Debt/fee report — Admin sees every team; a Head Coach only ever sees their
// own team's people (the backend already scopes GET /athletes that way for
// a HEAD_COACH caller, same as the main dashboard table). Fee data never
// appears on a printed card or any public page — this list, the roster
// tables, and the Edit page are the only places it's ever shown, and only
// to these two roles.
export default function DebtReportPage() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamFilter, setTeamFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .get("/athletes")
      .then(({ data }) => {
        setAthletes(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || t("debtReport.failedToLoadAthletes")))
      .finally(() => setLoading(false));
  }, []);

  const teams = useMemo(
    () => [...new Set(athletes.map((a) => a.team).filter(Boolean))].sort(),
    [athletes]
  );

  const owing = useMemo(() => {
    return athletes
      .filter((a) => a.feeOwed > 0)
      .filter((a) => !teamFilter || a.team === teamFilter)
      .sort((a, b) => b.feeOwed - a.feeOwed);
  }, [athletes, teamFilter]);

  const total = owing.reduce((sum, a) => sum + (a.feeOwed || 0), 0);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("debtReport.title")}</h2>
        <p>{t("debtReport.intro")}</p>
      </div>

      {isAdmin && teams.length > 1 && (
        <div className="field search-field" style={{ maxWidth: 260 }}>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">{t("debtReport.allTeams")}</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <p className="help-text" style={{ fontWeight: 600 }}>
            {owing.length === 0
              ? t("debtReport.noOneOwes")
              : `${owing.length} ${
                  owing.length === 1
                    ? t("debtReport.owingCountLabelSingular")
                    : t("debtReport.owingCountLabelPlural")
                } — $${total} ${t("debtReport.totalLabel")}`}
          </p>

          {owing.length > 0 && (
            <div className="table-scroll">
              <table className="athletes">
                <thead>
                  <tr>
                    <th>{t("common.photo")}</th>
                    <th>{t("debtReport.id")}</th>
                    <th>{t("common.name")}</th>
                    <th>{t("common.team")}</th>
                    <th>{t("common.role")}</th>
                    <th>{t("debtReport.owes")}</th>
                    <th>{t("debtReport.note")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {owing.map((a) => (
                    <tr key={a.assignmentId}>
                      <td data-label={t("common.photo")}>
                        <img
                          className="small-photo"
                          src={a.photoUrl ? resolveFileUrl(a.photoUrl) : "https://placehold.co/50x50?text=Photo"}
                          alt={a.fullName}
                        />
                      </td>
                      <td data-label={t("debtReport.id")}>{a.verifyId}</td>
                      <td data-label={t("common.name")}>{a.fullName}</td>
                      <td data-label={t("common.team")}>{a.team || "—"}</td>
                      <td data-label={t("common.role")}>{a.role || "—"}</td>
                      <td data-label={t("debtReport.owes")}>
                        <span className="badge rejected">${a.feeOwed}</span>
                      </td>
                      <td data-label={t("debtReport.note")}>
                        {(a.fees || []).length
                          ? a.fees.map((f) => `$${f.amount}${f.note ? ` — ${f.note}` : ""}`).join(", ")
                          : "—"}
                      </td>
                      <td data-label={t("common.actions")} className="actions-cell">
                        <Link className="action-btn" to={`/admin/athlete/${a._id}/edit`}>
                          {t("common.edit")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
