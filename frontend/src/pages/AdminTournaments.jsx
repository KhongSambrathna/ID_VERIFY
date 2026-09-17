import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import TeamSelect from "../components/TeamSelect";
import { useLanguage } from "../i18n/LanguageContext";

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

// One-line summary of a tournament's age rule, for the list table.
function ageRuleSummary(tour, t) {
  if (!tour.ageLimitYear) return t("adminTournaments.noAgeLimit");
  let s = t("adminTournaments.bornYearPlus").replace("{year}", tour.ageLimitYear);
  if (tour.overageSlots > 0) {
    s += t("adminTournaments.overageSummary")
      .replace("{slots}", tour.overageSlots)
      .replace("{used}", tour.overageUsed || 0);
    if (tour.overageLimitYear) s += t("adminTournaments.noEarlierThan").replace("{year}", tour.overageLimitYear);
  }
  return s;
}

const emptyForm = {
  name: "",
  description: "",
  entryFee: "",
  team: "",
  matchDates: [""],
  ageLimitYear: "",
  overageSlots: "",
  overageLimitYear: "",
  maxParticipants: "",
};

// Create/manage tournaments, register players on their behalf (for anyone
// without a phone/login of their own), and export the sign-up list. A Head
// Coach is always forced onto their own team (server-enforced too); only
// Admin can leave a tournament open to every team.
export default function AdminTournaments() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [athleteSearch, setAthleteSearch] = useState("");
  const [athletes, setAthletes] = useState([]);
  const [registering, setRegistering] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tournaments");
      setTournaments(data);
    } catch (err) {
      setError(err.response?.data?.message || t("common.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const setDateAt = (i, value) => {
    const next = [...form.matchDates];
    next[i] = value;
    setForm({ ...form, matchDates: next });
  };
  const addDateField = () => setForm({ ...form, matchDates: [...form.matchDates, ""] });
  const removeDateField = (i) => setForm({ ...form, matchDates: form.matchDates.filter((_, idx) => idx !== i) });

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const { data } = await api.post("/tournaments", {
        name: form.name,
        description: form.description,
        entryFee: form.entryFee,
        matchDates: form.matchDates.filter(Boolean),
        team: isAdmin ? form.team : undefined,
        ageLimitYear: form.ageLimitYear,
        overageSlots: form.overageSlots,
        overageLimitYear: form.overageLimitYear,
        maxParticipants: form.maxParticipants,
      });
      setForm(emptyForm);
      setShowCreate(false);
      // Jump straight to this tournament's squad-list page — empty at
      // first, but it's the same place players/registrations show up as
      // they sign up, and where the register-on-behalf search lives too.
      navigate(`/tournaments/${data._id}/squad`);
    } catch (err) {
      setFormError(err.response?.data?.message || t("adminTournaments.failedToCreate"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t("adminTournaments.confirmDeleteTournament"))) return;
    try {
      await api.delete(`/tournaments/${id}`);
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToDelete"));
    }
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/tournaments/${id}`);
      setDetail(data);
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToLoad"));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleExpand = (tour) => {
    if (expandedId === tour._id) {
      setExpandedId(null);
      setDetail(null);
      setAthletes([]);
      setAthleteSearch("");
      return;
    }
    setExpandedId(tour._id);
    setDetail(null);
    loadDetail(tour._id);
  };

  const searchAthletes = async (q) => {
    setAthleteSearch(q);
    if (!q.trim()) {
      setAthletes([]);
      return;
    }
    try {
      const { data } = await api.get("/athletes");
      const lower = q.trim().toLowerCase();
      setAthletes(
        data.filter(
          (a) =>
            [a.fullName, a.khmerName, a.verifyId].filter(Boolean).some((f) => f.toLowerCase().includes(lower)) &&
            !detail?.registrations?.some((r) => String(r.athlete) === String(a._id))
        )
      );
    } catch {
      setAthletes([]);
    }
  };

  const registerOnBehalf = async (athlete) => {
    setRegistering(athlete._id);
    try {
      await api.post(`/tournaments/${expandedId}/register-admin`, {
        athleteId: athlete._id,
        team: athlete.team,
      });
      await loadDetail(expandedId);
      load();
      setAthleteSearch("");
      setAthletes([]);
    } catch (err) {
      alert(err.response?.data?.message || t("adminTournaments.failedToRegister"));
    } finally {
      setRegistering(null);
    }
  };

  const removeRegistration = async (registrationId) => {
    if (!confirm(t("adminTournaments.confirmRemovePlayer"))) return;
    try {
      await api.delete(`/tournaments/${expandedId}/registrations/${registrationId}`);
      await loadDetail(expandedId);
      load();
    } catch (err) {
      alert(err.response?.data?.message || t("adminTournaments.failedToRemove"));
    }
  };

  const exportCsv = async (tour) => {
    try {
      const { data } = await api.get(`/tournaments/${tour._id}/export.csv`, { responseType: "blob" });
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tour.name.replace(/[^a-z0-9]+/gi, "-")}-registrations.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || t("adminTournaments.failedToExport"));
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("adminTournaments.title")}</h2>
        <p>{t("adminTournaments.subtitle")}</p>
        <div className="dash-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? t("common.cancel") : t("adminTournaments.newButton")}
          </button>
        </div>
      </div>

      {showCreate && (
        <form className="card" style={{ maxWidth: 520, marginBottom: 24 }} onSubmit={handleCreate}>
          <div className="field">
            <label>{t("common.name")}</label>
            <input value={form.name} onChange={update("name")} required />
          </div>
          <div className="field">
            <label>{t("adminTournaments.descriptionLabel")}</label>
            <textarea value={form.description} onChange={update("description")} rows={2} />
          </div>
          <div className="field">
            <label>{t("adminTournaments.entryFeeLabel")}</label>
            <input type="number" min="0" step="0.01" value={form.entryFee} onChange={update("entryFee")} />
          </div>
          <div className="field">
            <label>{t("adminTournaments.matchDatesLabel")}</label>
            {form.matchDates.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input type="date" value={d} onChange={(e) => setDateAt(i, e.target.value)} />
                {form.matchDates.length > 1 && (
                  <button type="button" className="link-btn" onClick={() => removeDateField(i)}>
                    {t("common.remove")}
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="link-btn" onClick={addDateField}>
              {t("adminTournaments.addDateButton")}
            </button>
          </div>
          {isAdmin ? (
            <>
              <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} label={t("adminTournaments.teamSelectLabel")} />
            </>
          ) : (
            <p className="help-text" style={{ marginTop: -8 }}>
              {t("adminTournaments.teamScopedHelp")}
            </p>
          )}

          <div className="field">
            <label>{t("adminTournaments.maxParticipantsLabel")}</label>
            <input type="number" min="1" value={form.maxParticipants} onChange={update("maxParticipants")} />
          </div>

          <div className="field">
            <label>{t("adminTournaments.ageLimitLabel")}</label>
            <input type="number" min="1900" placeholder={t("adminTournaments.ageLimitPlaceholder")} value={form.ageLimitYear} onChange={update("ageLimitYear")} />
          </div>
          {form.ageLimitYear && (
            <>
              <div className="field">
                <label>{t("adminTournaments.overageSlotsLabel")}</label>
                <input type="number" min="0" value={form.overageSlots} onChange={update("overageSlots")} />
              </div>
              <div className="field">
                <label>{t("adminTournaments.overageLimitYearLabel")}</label>
                <input
                  type="number"
                  min="1900"
                  placeholder={t("adminTournaments.overageLimitYearPlaceholder")}
                  value={form.overageLimitYear}
                  onChange={update("overageLimitYear")}
                />
              </div>
              <p className="help-text" style={{ marginTop: -8 }}>
                {t("adminTournaments.overageHelp")}
              </p>
            </>
          )}
          {formError && <div className="error-text">{formError}</div>}
          <button className="btn btn-primary" disabled={saving}>
            {saving ? t("adminTournaments.creating") : t("adminTournaments.createButton")}
          </button>
        </form>
      )}

      {loading && <p>{t("common.loading")}</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("common.team")}</th>
                <th>{t("adminTournaments.entryFeeHeader")}</th>
                <th>{t("adminTournaments.datesHeader")}</th>
                <th>{t("adminTournaments.rulesHeader")}</th>
                <th>{t("adminTournaments.registeredHeader")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tour) => (
                <Fragment key={tour._id}>
                  <tr>
                    <td data-label={t("common.name")}>{tour.name}</td>
                    <td data-label={t("common.team")}>{tour.team || t("adminTournaments.allTeams")}</td>
                    <td data-label={t("adminTournaments.entryFeeHeader")}>${tour.entryFee || 0}</td>
                    <td data-label={t("adminTournaments.datesHeader")}>
                      {tour.matchDates?.length ? tour.matchDates.map(formatDate).join(", ") : "—"}
                    </td>
                    <td data-label={t("adminTournaments.rulesHeader")}>
                      {ageRuleSummary(tour, t)}
                      {tour.maxParticipants
                        ? t("adminTournaments.capSuffix").replace("{count}", tour.registrationCount).replace("{max}", tour.maxParticipants)
                        : ""}
                    </td>
                    <td data-label={t("adminTournaments.registeredHeader")}>{tour.registrationCount}</td>
                    <td data-label={t("common.actions")} className="actions-cell">
                      <button className="action-btn" onClick={() => toggleExpand(tour)}>
                        {expandedId === tour._id ? t("adminTournaments.hide") : t("adminTournaments.viewRegister")}
                      </button>
                      <button className="action-btn" onClick={() => navigate(`/tournaments/${tour._id}/squad`)}>
                        {t("adminTournaments.viewSquad")}
                      </button>
                      <button className="action-btn" onClick={() => exportCsv(tour)}>
                        {t("common.export")}
                      </button>
                      <button className="action-btn danger" onClick={() => remove(tour._id)}>
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                  {expandedId === tour._id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--cream)" }}>
                        {detailLoading && <p>{t("common.loading")}</p>}
                        {!detailLoading && detail && (
                          <div style={{ padding: "8px 4px" }}>
                            {detail.description && <p className="help-text">{detail.description}</p>}
                            <h4 style={{ marginBottom: 6 }}>
                              {t("adminTournaments.registeredPlayersHeading").replace("{count}", detail.registrations.length)}
                            </h4>
                            {detail.teamLineups?.length > 0 && (
                              <p className="help-text" style={{ marginTop: -4 }}>
                                {t("adminTournaments.syncHelpPrefix")}{" "}
                                {detail.teamLineups.map((tl, i) => (
                                  <span key={tl.team}>
                                    {i > 0 && " · "}
                                    <Link
                                      className="link-btn"
                                      to={isAdmin ? `/admin/matchday?team=${encodeURIComponent(tl.team)}&tab=lineups` : `/coach?tab=lineups`}
                                    >
                                      {t("adminTournaments.openSquadList").replace("{team}", tl.team)}
                                    </Link>
                                  </span>
                                ))}
                              </p>
                            )}
                            {detail.registrations.length === 0 ? (
                              <p className="help-text">{t("adminTournaments.nobodyRegistered")}</p>
                            ) : (
                              <ul className="fee-items" style={{ marginBottom: 12 }}>
                                {detail.registrations.map((r) => (
                                  <li key={r._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>
                                      <span className="caps-display">{r.fullName} {r.khmerName ? `(${r.khmerName})` : ""} — {r.team}</span>
                                      {r.jerseyNumber != null ? ` · #${r.jerseyNumber}` : ""}
                                      {r.isOverage ? ` · ${t("adminTournaments.overageSuffix")}` : ""}
                                      {r.registeredBy ? ` · ${t("adminTournaments.registeredByStaffSuffix")}` : ""}
                                    </span>
                                    <button className="link-btn" onClick={() => removeRegistration(r._id)}>
                                      {t("common.remove")}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="field search-field" style={{ maxWidth: 340 }}>
                              <label>{t("adminTournaments.registerOnBehalfLabel")}</label>
                              <input
                                placeholder={t("adminTournaments.searchPlaceholder")}
                                value={athleteSearch}
                                onChange={(e) => searchAthletes(e.target.value)}
                              />
                            </div>
                            {athletes.length > 0 && (
                              <ul className="fee-items">
                                {athletes.map((a) => (
                                  <li key={a.assignmentId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>
                                      <span className="caps-display">{a.fullName} — {a.team}</span>
                                      {a.feeOwed > 0 ? ` (${t("adminTournaments.owes")} $${a.feeOwed})` : ""}
                                    </span>
                                    <button
                                      className="action-btn positive"
                                      disabled={registering === a._id}
                                      onClick={() => registerOnBehalf(a)}
                                    >
                                      {registering === a._id ? t("adminTournaments.registering") : t("adminTournaments.registerButton")}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                    {t("adminTournaments.noneYet")}
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
