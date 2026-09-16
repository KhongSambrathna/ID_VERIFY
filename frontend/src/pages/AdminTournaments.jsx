import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import TeamSelect from "../components/TeamSelect";

function formatDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date)) return "";
  return date.toISOString().slice(0, 10);
}

// One-line summary of a tournament's age rule, for the list table.
function ageRuleSummary(t) {
  if (!t.ageLimitYear) return "No age limit";
  let s = `Born ${t.ageLimitYear}+`;
  if (t.overageSlots > 0) {
    s += `, up to ${t.overageSlots} over-age (${t.overageUsed || 0} used)`;
    if (t.overageLimitYear) s += ` — no earlier than ${t.overageLimitYear}`;
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
      setError(err.response?.data?.message || "Failed to load tournaments");
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
      setFormError(err.response?.data?.message || "Failed to create tournament");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this tournament and its whole registration list?")) return;
    try {
      await api.delete(`/tournaments/${id}`);
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete tournament");
    }
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/tournaments/${id}`);
      setDetail(data);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load tournament");
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleExpand = (t) => {
    if (expandedId === t._id) {
      setExpandedId(null);
      setDetail(null);
      setAthletes([]);
      setAthleteSearch("");
      return;
    }
    setExpandedId(t._id);
    setDetail(null);
    loadDetail(t._id);
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
      alert(err.response?.data?.message || "Failed to register");
    } finally {
      setRegistering(null);
    }
  };

  const removeRegistration = async (registrationId) => {
    if (!confirm("Remove this player from the tournament?")) return;
    try {
      await api.delete(`/tournaments/${expandedId}/registrations/${registrationId}`);
      await loadDetail(expandedId);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to remove");
    }
  };

  const exportCsv = async (t) => {
    try {
      const { data } = await api.get(`/tournaments/${t._id}/export.csv`, { responseType: "blob" });
      const url = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${t.name.replace(/[^a-z0-9]+/gi, "-")}-registrations.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to export");
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Tournaments</h2>
        <p>
          Create a tournament for players to register into themselves. Anyone owing a fee on the team
          they're registering under is blocked until it's paid — settle it first (Edit athlete → fees).
        </p>
        <div className="dash-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New tournament"}
          </button>
        </div>
      </div>

      {showCreate && (
        <form className="card" style={{ maxWidth: 520, marginBottom: 24 }} onSubmit={handleCreate}>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={update("name")} required />
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <textarea value={form.description} onChange={update("description")} rows={2} />
          </div>
          <div className="field">
            <label>Entry fee ($)</label>
            <input type="number" min="0" step="0.01" value={form.entryFee} onChange={update("entryFee")} />
          </div>
          <div className="field">
            <label>Match date(s)</label>
            {form.matchDates.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input type="date" value={d} onChange={(e) => setDateAt(i, e.target.value)} />
                {form.matchDates.length > 1 && (
                  <button type="button" className="link-btn" onClick={() => removeDateField(i)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="link-btn" onClick={addDateField}>
              + Add another date
            </button>
          </div>
          {isAdmin ? (
            <>
              <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} label="Team (leave blank for open to all)" />
            </>
          ) : (
            <p className="help-text" style={{ marginTop: -8 }}>
              This tournament will be scoped to your own team only.
            </p>
          )}

          <div className="field">
            <label>Max participants (leave blank for no cap)</label>
            <input type="number" min="1" value={form.maxParticipants} onChange={update("maxParticipants")} />
          </div>

          <div className="field">
            <label>Age limit — born in this year or later (leave blank for no age limit)</label>
            <input type="number" min="1900" placeholder="e.g. 2010" value={form.ageLimitYear} onChange={update("ageLimitYear")} />
          </div>
          {form.ageLimitYear && (
            <>
              <div className="field">
                <label>Over-age exceptions allowed</label>
                <input type="number" min="0" value={form.overageSlots} onChange={update("overageSlots")} />
              </div>
              <div className="field">
                <label>Oldest birth year still allowed (for those exceptions)</label>
                <input
                  type="number"
                  min="1900"
                  placeholder="e.g. 2008"
                  value={form.overageLimitYear}
                  onChange={update("overageLimitYear")}
                />
              </div>
              <p className="help-text" style={{ marginTop: -8 }}>
                Example: age limit 2010 with 4 over-age exceptions down to 2008 means players born 2010+
                register normally, and up to 4 players born 2008–2009 may also register.
              </p>
            </>
          )}
          {formError && <div className="error-text">{formError}</div>}
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create tournament"}
          </button>
        </form>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Entry fee</th>
                <th>Dates</th>
                <th>Rules</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <Fragment key={t._id}>
                  <tr>
                    <td data-label="Name">{t.name}</td>
                    <td data-label="Team">{t.team || "All teams"}</td>
                    <td data-label="Entry fee">${t.entryFee || 0}</td>
                    <td data-label="Dates">
                      {t.matchDates?.length ? t.matchDates.map(formatDate).join(", ") : "—"}
                    </td>
                    <td data-label="Rules">
                      {ageRuleSummary(t)}
                      {t.maxParticipants ? ` · Cap ${t.registrationCount}/${t.maxParticipants}` : ""}
                    </td>
                    <td data-label="Registered">{t.registrationCount}</td>
                    <td data-label="Actions" className="actions-cell">
                      <button className="action-btn" onClick={() => toggleExpand(t)}>
                        {expandedId === t._id ? "Hide" : "View / register"}
                      </button>
                      <button className="action-btn" onClick={() => navigate(`/tournaments/${t._id}/squad`)}>
                        View squad
                      </button>
                      <button className="action-btn" onClick={() => exportCsv(t)}>
                        Export
                      </button>
                      <button className="action-btn danger" onClick={() => remove(t._id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expandedId === t._id && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--cream)" }}>
                        {detailLoading && <p>Loading…</p>}
                        {!detailLoading && detail && (
                          <div style={{ padding: "8px 4px" }}>
                            {detail.description && <p className="help-text">{detail.description}</p>}
                            <h4 style={{ marginBottom: 6 }}>Registered players ({detail.registrations.length})</h4>
                            {detail.teamLineups?.length > 0 && (
                              <p className="help-text" style={{ marginTop: -4 }}>
                                Kept in sync with each team's Squad list, ready for Formation/Starting XI —{" "}
                                {detail.teamLineups.map((tl, i) => (
                                  <span key={tl.team}>
                                    {i > 0 && " · "}
                                    <Link
                                      className="link-btn"
                                      to={isAdmin ? `/admin/matchday?team=${encodeURIComponent(tl.team)}&tab=lineups` : `/coach?tab=lineups`}
                                    >
                                      Open {tl.team}'s Squad list
                                    </Link>
                                  </span>
                                ))}
                              </p>
                            )}
                            {detail.registrations.length === 0 ? (
                              <p className="help-text">Nobody registered yet.</p>
                            ) : (
                              <ul className="fee-items" style={{ marginBottom: 12 }}>
                                {detail.registrations.map((r) => (
                                  <li key={r._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>
                                      {r.fullName} {r.khmerName ? `(${r.khmerName})` : ""} — {r.team}
                                      {r.jerseyNumber != null ? ` · #${r.jerseyNumber}` : ""}
                                      {r.isOverage ? " · over-age" : ""}
                                      {r.registeredBy ? " · registered by staff" : ""}
                                    </span>
                                    <button className="link-btn" onClick={() => removeRegistration(r._id)}>
                                      Remove
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="field search-field" style={{ maxWidth: 340 }}>
                              <label>Register a player (no phone / on their behalf)</label>
                              <input
                                placeholder="Search by name or ID…"
                                value={athleteSearch}
                                onChange={(e) => searchAthletes(e.target.value)}
                              />
                            </div>
                            {athletes.length > 0 && (
                              <ul className="fee-items">
                                {athletes.map((a) => (
                                  <li key={a.assignmentId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>
                                      {a.fullName} — {a.team}
                                      {a.feeOwed > 0 ? ` (owes $${a.feeOwed})` : ""}
                                    </span>
                                    <button
                                      className="action-btn positive"
                                      disabled={registering === a._id}
                                      onClick={() => registerOnBehalf(a)}
                                    >
                                      {registering === a._id ? "Registering…" : "Register"}
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
                    No tournaments yet.
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
