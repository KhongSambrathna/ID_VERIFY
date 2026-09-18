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
  const [search, setSearch] = useState("");
  // Inline "record a payment received" form state, keyed by assignmentId.
  // `cashMethod` is "CASH" (received in person) or "ABA_QR" (paid by
  // scanning the team's ABA Merchant KHQR — see the Coach dashboard's
  // "Team's ABA payment QR" card — and reported back to be recorded here).
  const [cashOpenId, setCashOpenId] = useState(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashMethod, setCashMethod] = useState("CASH");
  const [cashNote, setCashNote] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [cashError, setCashError] = useState("");

  const load = () => {
    setLoading(true);
    return api
      .get("/athletes")
      .then(({ data }) => {
        setAthletes(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || t("debtReport.failedToLoadAthletes")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCashForm = (a) => {
    setCashOpenId(a.assignmentId);
    setCashAmount(String(a.feeOwed));
    setCashMethod("CASH");
    setCashNote("");
    setCashError("");
  };

  const closeCashForm = () => {
    setCashOpenId(null);
    setCashError("");
  };

  const saveCashPayment = async (a) => {
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > a.feeOwed) {
      setCashError(t("debtReport.cashAmountInvalid"));
      return;
    }
    setCashSaving(true);
    setCashError("");
    try {
      await api.post("/payments/cash", {
        athleteId: a._id,
        assignmentId: a.assignmentId,
        amount,
        method: cashMethod,
        note: cashNote,
      });
      setCashOpenId(null);
      await load();
    } catch (err) {
      setCashError(err.response?.data?.message || t("debtReport.cashSaveFailed"));
    } finally {
      setCashSaving(false);
    }
  };

  const teams = useMemo(
    () => [...new Set(athletes.map((a) => a.team).filter(Boolean))].sort(),
    [athletes]
  );

  const owing = useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes
      .filter((a) => a.feeOwed > 0)
      .filter((a) => !teamFilter || a.team === teamFilter)
      .filter(
        (a) =>
          !q ||
          [a.fullName, a.khmerName, a.team, a.role, a.verifyId]
            .filter(Boolean)
            .some((field) => field.toLowerCase().includes(q))
      )
      .sort((a, b) => b.feeOwed - a.feeOwed);
  }, [athletes, teamFilter, search]);

  const total = owing.reduce((sum, a) => sum + (a.feeOwed || 0), 0);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("debtReport.title")}</h2>
        <p>{t("debtReport.intro")}</p>
      </div>

      <div className="filter-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field search-field" style={{ maxWidth: 260 }}>
          <input
            placeholder={t("debtReport.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
      </div>

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
                      <td data-label={t("common.name")} className="caps-display">{a.fullName}</td>
                      <td data-label={t("common.team")} className="caps-display">{a.team || "—"}</td>
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
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => (cashOpenId === a.assignmentId ? closeCashForm() : openCashForm(a))}
                        >
                          {t("debtReport.recordCash")}
                        </button>
                        {cashOpenId === a.assignmentId && (
                          <div
                            className="field"
                            style={{ width: "100%", marginTop: 8, maxWidth: 260 }}
                          >
                            <label>{t("debtReport.cashMethodLabel")}</label>
                            <select value={cashMethod} onChange={(e) => setCashMethod(e.target.value)}>
                              <option value="CASH">{t("debtReport.methodCash")}</option>
                              <option value="ABA_QR">{t("debtReport.methodAbaQr")}</option>
                            </select>
                            <label style={{ marginTop: 6 }}>{t("debtReport.cashAmountLabel")}</label>
                            <input
                              type="number"
                              min="0.01"
                              max={a.feeOwed}
                              step="0.01"
                              value={cashAmount}
                              onChange={(e) => setCashAmount(e.target.value)}
                            />
                            <label style={{ marginTop: 6 }}>{t("debtReport.cashNoteLabel")}</label>
                            <input type="text" value={cashNote} onChange={(e) => setCashNote(e.target.value)} />
                            {cashError && (
                              <p className="error-text" style={{ margin: "4px 0" }}>
                                {cashError}
                              </p>
                            )}
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={cashSaving}
                                onClick={() => saveCashPayment(a)}
                              >
                                {cashSaving ? t("debtReport.cashSavingBtn") : t("debtReport.cashSaveBtn")}
                              </button>
                              <button type="button" className="btn btn-outline" onClick={closeCashForm}>
                                {t("debtReport.cashCancelBtn")}
                              </button>
                            </div>
                          </div>
                        )}
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
