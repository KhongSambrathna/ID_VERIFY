import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import { resolveFileUrl } from "../utils/fileUrl";
import { useAuth } from "../context/AuthContext";

const ROLE_OPTIONS = ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"];

function toDateInputValue(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

export default function EditAthlete() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isHeadCoach, isAdmin, team: coachTeam } = useAuth();

  const [form, setForm] = useState(null); // null until the record loads
  const [athlete, setAthlete] = useState(null); // raw record — source of `assignments`
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
  const [photo, setPhoto] = useState(null);
  // Reference/ID documents (national ID copy, birth certificate, etc.) —
  // Admin/Head Coach only, shown when an opposing team asks to verify
  // identity in person. `existingDocs` is what's already saved;
  // `removeDocIds` marks some of those for removal; `newDocs` are new files
  // picked but not yet uploaded. All three only take effect when the main
  // "Save changes" button below is pressed, same as a photo replacement.
  const [existingDocs, setExistingDocs] = useState([]);
  const [removeDocIds, setRemoveDocIds] = useState(new Set());
  const [newDocs, setNewDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // Per-assignment UI state: a draft role while editing, a draft new
  // fee/debt row per assignment (amount + note, before it's added), and a
  // per-row "this one's request is in flight" flag so only that row shows
  // "Saving…".
  const [roleDrafts, setRoleDrafts] = useState({});
  const [jerseyDrafts, setJerseyDrafts] = useState({});
  const [newFeeDrafts, setNewFeeDrafts] = useState({});
  const [busyAssignmentId, setBusyAssignmentId] = useState(null);
  const [renewing, setRenewing] = useState(false);
  const [newTeam, setNewTeam] = useState(isHeadCoach ? coachTeam || "" : "");
  const [newRole, setNewRole] = useState("PLAYER");
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");

  const loadAthlete = () => {
    return api
      .get(`/athletes/${id}`)
      .then(({ data }) => {
        setAthlete(data);
        setForm({
          fullName: data.fullName || "",
          khmerName: data.khmerName || "",
          dateOfBirth: toDateInputValue(data.dateOfBirth),
          gender: data.gender || "male",
          address: data.address || "",
          isAvailable: data.isAvailable ? "true" : "false",
        });
        setCurrentPhotoUrl(data.photoUrl || null);
        setExistingDocs(data.supportingDocuments || []);
        setRemoveDocIds(new Set());
        setNewDocs([]);
        setRoleDrafts({});
        setJerseyDrafts({});
        setNewFeeDrafts({});
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load athlete"));
  };

  useEffect(() => {
    loadAthlete().finally(() => setLoading(false));
  }, [id]);

  const update = (key) => (e) => {
    setInfoMessage("");
    setForm({ ...form, [key]: e.target.value });
  };

  const toggleRemoveDoc = (docId) => {
    setInfoMessage("");
    setRemoveDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);
      newDocs.forEach((f) => data.append("documents", f));
      if (removeDocIds.size) data.append("removeDocumentIds", JSON.stringify([...removeDocIds]));

      const { data: result } = await api.put(`/athletes/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (result?.noChanges) {
        // Nothing was actually different from what's already saved (e.g. just
        // opened the page and hit Save) — stay put, don't trigger a re-approval.
        setInfoMessage("No changes to save.");
        return;
      }
      navigate(isHeadCoach ? "/coach" : `/admin/athlete/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // After a whole-record cascade delete (the person's only assignment was
  // removed/rejected), there's nothing left here to edit — go back to the
  // list instead of showing a broken form.
  const afterAssignmentChange = (result) => {
    if (result?.deletedAthlete) {
      navigate(isHeadCoach ? "/coach" : "/admin");
      return;
    }
    setAthlete(result);
    setRoleDrafts({});
  };

  // Saves whichever of role / jersey number was actually touched for this
  // assignment. Jersey number never triggers re-approval (it's a squad-list
  // convenience, not something that affects identity/eligibility) — only a
  // real role change does, same as before.
  const saveAssignmentMeta = async (a) => {
    setAssignmentError("");
    setBusyAssignmentId(a._id);
    try {
      const payload = { role: roleDrafts[a._id] ?? a.role };
      if (jerseyDrafts[a._id] !== undefined) payload.jerseyNumber = jerseyDrafts[a._id];
      const { data } = await api.put(`/athletes/${id}/assignments/${a._id}`, payload);
      afterAssignmentChange(data);
      setJerseyDrafts((prev) => {
        const next = { ...prev };
        delete next[a._id];
        return next;
      });
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to save");
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const jerseyIsDirty = (a) => {
    if (jerseyDrafts[a._id] === undefined) return false;
    const draft = jerseyDrafts[a._id];
    const draftNum = draft === "" ? null : Number(draft);
    return draftNum !== (a.jerseyNumber ?? null);
  };

  // Admin any record, Head Coach their own team — just stamps
  // lastVerifiedAt to today. Never blocks anything; it only clears the
  // "needs renewal" badge once it's over a year old.
  const renewVerification = async () => {
    setRenewing(true);
    try {
      const { data } = await api.put(`/athletes/${id}/renew`);
      setAthlete(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to renew");
    } finally {
      setRenewing(false);
    }
  };

  // Fee/debt rows are internal bookkeeping only — adding or removing one
  // never flips the assignment back to "pending" the way a role change
  // does. Each row is its own {amount, note} — adding a newly-owed fee
  // never overwrites what was already recorded, so a second debt just
  // becomes a second row.
  const addFeeAction = async (assignmentId) => {
    const draft = newFeeDrafts[assignmentId] || {};
    const amount = Number(draft.amount);
    if (!draft.amount || !Number.isFinite(amount) || amount <= 0) {
      setAssignmentError("Enter a valid, positive fee amount");
      return;
    }
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.post(`/athletes/${id}/assignments/${assignmentId}/fees`, {
        amount,
        note: draft.note || "",
      });
      afterAssignmentChange(data);
      setNewFeeDrafts({ ...newFeeDrafts, [assignmentId]: { amount: "", note: "" } });
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to add fee");
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const removeFeeAction = async (assignmentId, feeId) => {
    if (!confirm("Remove this fee row?")) return;
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.delete(`/athletes/${id}/assignments/${assignmentId}/fees/${feeId}`);
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to remove fee");
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const removeAssignmentAction = async (assignmentId, isLast) => {
    const msg = isLast
      ? "This is their only team — removing it will delete this person's whole record. Continue?"
      : "Remove this team/role?";
    if (!confirm(msg)) return;
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.delete(`/athletes/${id}/assignments/${assignmentId}`);
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to remove");
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const approveAssignmentAction = async (assignmentId) => {
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.put(`/athletes/${id}/assignments/${assignmentId}/approve`);
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to approve");
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const rejectAssignmentAction = async (assignmentId) => {
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.put(`/athletes/${id}/assignments/${assignmentId}/reject`);
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to reject");
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const addAssignmentAction = async (e) => {
    e.preventDefault();
    setAssignmentError("");
    setAddingAssignment(true);
    try {
      const { data } = await api.post(`/athletes/${id}/assignments`, {
        team: isHeadCoach ? coachTeam : newTeam,
        role: newRole,
      });
      setAthlete(data);
      setNewRole("PLAYER");
      if (!isHeadCoach) setNewTeam("");
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to add team/role");
    } finally {
      setAddingAssignment(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingBottom: 60 }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="container" style={{ paddingBottom: 60 }}>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header">
        <h2>Edit athlete</h2>
        <div className="dash-actions">
          <span className="help-text" style={{ margin: 0 }}>
            {athlete?.lastVerifiedAt
              ? `Last verified ${new Date(athlete.lastVerifiedAt).toLocaleDateString()}`
              : "Never verified in person"}
          </span>
          {(!athlete?.lastVerifiedAt ||
            Date.now() - new Date(athlete.lastVerifiedAt).getTime() > 365 * 24 * 60 * 60 * 1000) && (
            <span className="badge rejected">Needs renewal</span>
          )}
          <button type="button" className="link-btn" onClick={renewVerification} disabled={renewing}>
            {renewing ? "Renewing…" : "Renew (verified today)"}
          </button>
          {!isHeadCoach && (
            <Link to={`/admin/athlete/${id}`} className="link-btn">
              ← Back to record
            </Link>
          )}
        </div>
      </div>
      {isHeadCoach && (
        <p className="help-text" style={{ maxWidth: 640 }}>
          Saving changes sends your own team's assignment back to <strong>Pending</strong> — an Admin
          needs to re-approve it before it's public again. Their other teams (if any) aren't affected.
        </p>
      )}

      {athlete && (
        <div className="card assignments-card" style={{ maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>Team assignments</h3>
          <p className="help-text" style={{ marginTop: -8, marginBottom: 14 }}>
            This person can belong to more than one team, and hold more than one role — even on the same
            team.
          </p>

          {athlete.assignments.length === 0 && <p className="help-text">No team assigned yet.</p>}

          {athlete.assignments.map((a) => {
            const canManage = isAdmin || a.team === coachTeam;
            const isBusy = busyAssignmentId === a._id;
            const isLast = athlete.assignments.length === 1;
            return (
              <div key={a._id} className="assignment-row">
                <div className="assignment-row-main">
                  <span className="assignment-team">{a.team}</span>
                  <select
                    value={roleDrafts[a._id] ?? a.role}
                    onChange={(e) => setRoleDrafts({ ...roleDrafts, [a._id]: e.target.value })}
                    disabled={!canManage || isBusy}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    placeholder="#"
                    className="jersey-input"
                    value={jerseyDrafts[a._id] ?? (a.jerseyNumber ?? "")}
                    onChange={(e) => setJerseyDrafts({ ...jerseyDrafts, [a._id]: e.target.value })}
                    disabled={!canManage || isBusy}
                    title="Jersey number for this team"
                  />
                  {canManage &&
                    ((roleDrafts[a._id] !== undefined && roleDrafts[a._id] !== a.role) || jerseyIsDirty(a)) && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => saveAssignmentMeta(a)}
                      >
                        Save
                      </button>
                    )}
                  {a.approvalStatus === "pending" && !a.pendingRemoval && (
                    <span className="badge rejected">Pending</span>
                  )}
                  {a.pendingRemoval && <span className="badge rejected">Removal requested</span>}
                  {!(a.fees || []).length ? (
                    <span className="badge verified">Fee paid</span>
                  ) : (
                    <span className="badge rejected">
                      Owes ${a.fees.reduce((sum, f) => sum + (f.amount || 0), 0)}
                    </span>
                  )}
                </div>

                <div className="assignment-row-fee">
                  {(a.fees || []).length > 0 && (
                    <ul className="fee-items">
                      {a.fees.map((f) => (
                        <li key={f._id}>
                          <span>
                            ${f.amount}
                            {f.note ? ` — ${f.note}` : ""}
                          </span>
                          {canManage && (
                            <button
                              type="button"
                              className="link-btn"
                              disabled={isBusy}
                              onClick={() => removeFeeAction(a._id, f._id)}
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && (
                    <div className="fee-add-row">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Amount"
                        value={newFeeDrafts[a._id]?.amount ?? ""}
                        onChange={(e) =>
                          setNewFeeDrafts({
                            ...newFeeDrafts,
                            [a._id]: { ...newFeeDrafts[a._id], amount: e.target.value },
                          })
                        }
                        disabled={isBusy}
                      />
                      <input
                        type="text"
                        placeholder="For (e.g. Uniform fee)"
                        maxLength={200}
                        value={newFeeDrafts[a._id]?.note ?? ""}
                        onChange={(e) =>
                          setNewFeeDrafts({
                            ...newFeeDrafts,
                            [a._id]: { ...newFeeDrafts[a._id], note: e.target.value },
                          })
                        }
                        disabled={isBusy}
                      />
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy || !newFeeDrafts[a._id]?.amount}
                        onClick={() => addFeeAction(a._id)}
                      >
                        + Add fee
                      </button>
                    </div>
                  )}
                </div>

                <div className="assignment-row-actions">
                  {isAdmin && a.approvalStatus === "pending" && !a.pendingRemoval && (
                    <>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => approveAssignmentAction(a._id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => rejectAssignmentAction(a._id)}
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {a.pendingRemoval ? (
                    isAdmin ? (
                      <>
                        <button
                          type="button"
                          className="link-btn"
                          disabled={isBusy}
                          onClick={() => approveAssignmentAction(a._id)}
                        >
                          Confirm removal
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          disabled={isBusy}
                          onClick={() => rejectAssignmentAction(a._id)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <span className="help-text">Waiting for admin</span>
                    )
                  ) : (
                    canManage && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => removeAssignmentAction(a._id, isLast)}
                      >
                        Remove
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {(isAdmin || isHeadCoach) && (
            <form className="assignment-add-row" onSubmit={addAssignmentAction}>
              {isHeadCoach ? (
                <input value={coachTeam || ""} disabled style={{ maxWidth: 160 }} />
              ) : (
                <TeamSelect value={newTeam} onChange={setNewTeam} required />
              )}
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} disabled={addingAssignment}>
                {addingAssignment ? "Adding…" : "Add team/role"}
              </button>
            </form>
          )}

          {assignmentError && <div className="error-text" style={{ marginTop: 8 }}>{assignmentError}</div>}
        </div>
      )}

      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <div className="field">
          <label>Full name</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>Khmer name</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>
        <div className="field">
          <label>Date of birth</label>
          <input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
        </div>
        <div className="field">
          <label>Gender</label>
          <select value={form.gender} onChange={update("gender")}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Address</label>
          <input value={form.address} onChange={update("address")} />
        </div>
        <div className="field">
          <label>Availability</label>
          <select value={form.isAvailable} onChange={update("isAvailable")}>
            <option value="true">Available</option>
            <option value="false">Not available</option>
          </select>
        </div>
        <div className="field">
          <label>Photo</label>
          {currentPhotoUrl && !photo && (
            <img src={resolveFileUrl(currentPhotoUrl)} alt="Current" className="edit-current-photo" />
          )}
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          <p className="help-text">Leave empty to keep the current photo.</p>
        </div>

        <div className="field">
          <label>Reference documents</label>
          <p className="help-text" style={{ marginTop: -4 }}>
            National ID copy, birth certificate, family book, etc. — for Admin and Head Coach only, to
            prove identity in person if another team asks to check. Never shown on the printed card,
            export, or public page.
          </p>
          {existingDocs.length > 0 && (
            <ul className="fee-items">
              {existingDocs.map((doc) => (
                <li key={doc._id}>
                  <a href={resolveFileUrl(doc.fileUrl)} target="_blank" rel="noreferrer">
                    {doc.label || "Document"}
                  </a>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={removeDocIds.has(String(doc._id))}
                      onChange={() => toggleRemoveDoc(String(doc._id))}
                    />
                    Remove
                  </label>
                </li>
              ))}
            </ul>
          )}
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setNewDocs(Array.from(e.target.files))}
          />
          <p className="help-text">
            Adding or removing a document only takes effect when you press "Save changes" below.
          </p>
        </div>

        {error && <div className="error-text">{error}</div>}
        {infoMessage && <p className="help-text">{infoMessage}</p>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
