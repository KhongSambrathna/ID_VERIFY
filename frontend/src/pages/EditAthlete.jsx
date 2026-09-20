import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api/axios";
import TeamSelect from "../components/TeamSelect";
import { resolveFileUrl } from "../utils/fileUrl";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import RequireActiveSubscription from "../components/RequireActiveSubscription";

const ROLE_OPTIONS = ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"];
const ROLE_LABEL_KEYS = {
  PLAYER: "editAthlete.rolePlayer",
  "ASSISTAN COACH": "editAthlete.roleAssistantCoach",
  "HEAD COACH": "editAthlete.roleHeadCoach",
  TECHNICAL: "editAthlete.roleTechnical",
  MEDIC: "editAthlete.roleMedic",
};

function toDateInputValue(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

export default function EditAthlete() {
  const { t } = useLanguage();
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
          status: data.status || "unverified",
        });
        setCurrentPhotoUrl(data.photoUrl || null);
        setExistingDocs(data.supportingDocuments || []);
        setRemoveDocIds(new Set());
        setNewDocs([]);
        setRoleDrafts({});
        setJerseyDrafts({});
        setNewFeeDrafts({});
      })
      .catch((err) => setError(err.response?.data?.message || t("editAthlete.failedToLoad")));
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
        setInfoMessage(t("editAthlete.noChangesToSave"));
        return;
      }
      navigate(isHeadCoach ? "/coach" : `/admin/athlete/${id}`);
    } catch (err) {
      setError(err.response?.data?.message || t("editAthlete.failedToSaveChanges"));
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
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToSave"));
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
      setError(err.response?.data?.message || t("editAthlete.failedToRenew"));
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
      setAssignmentError(t("editAthlete.enterValidFee"));
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
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToAddFee"));
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const removeFeeAction = async (assignmentId, feeId) => {
    if (!confirm(t("editAthlete.confirmRemoveFee"))) return;
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.delete(`/athletes/${id}/assignments/${assignmentId}/fees/${feeId}`);
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToRemoveFee"));
    } finally {
      setBusyAssignmentId(null);
    }
  };

  const removeAssignmentAction = async (assignmentId, isLast) => {
    const msg = isLast
      ? t("editAthlete.confirmDeleteWholeRecord")
      : t("editAthlete.confirmRemoveAssignment");
    if (!confirm(msg)) return;
    // Only Admin's removal here is immediate (Head Coach's just flags a
    // pending removal request for Admin to review) — so only Admin is
    // asked for an optional reason, sent along in the Head Coach's
    // Telegram notification. Cancelling the prompt aborts the whole action.
    let reason = "";
    if (isAdmin) {
      reason = prompt(t("editAthlete.removeReasonPrompt"));
      if (reason === null) return;
    }
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.delete(`/athletes/${id}/assignments/${assignmentId}`, {
        data: { reason: reason.trim() },
      });
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToRemoveAssignment"));
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
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToApprove"));
    } finally {
      setBusyAssignmentId(null);
    }
  };

  // Reject is Admin-only server-side either way — an optional reason is
  // folded into the Head Coach's Telegram notification so they know why.
  // Cancelling the prompt aborts the whole action.
  const rejectAssignmentAction = async (assignmentId) => {
    const reason = prompt(t("editAthlete.rejectReasonPrompt"));
    if (reason === null) return;
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.put(`/athletes/${id}/assignments/${assignmentId}/reject`, {
        reason: reason.trim(),
      });
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToReject"));
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
      setAssignmentError(err.response?.data?.message || t("editAthlete.failedToAddAssignment"));
    } finally {
      setAddingAssignment(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingBottom: 60 }}>
        <p>{t("editAthlete.loading")}</p>
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
    <RequireActiveSubscription>
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header">
        <h2>{t("editAthlete.title")}</h2>
        <div className="dash-actions">
          <span className="help-text" style={{ margin: 0 }}>
            {athlete?.lastVerifiedAt
              ? t("editAthlete.lastVerified").replace(
                  "{date}",
                  new Date(athlete.lastVerifiedAt).toLocaleDateString()
                )
              : t("editAthlete.neverVerified")}
          </span>
          {(!athlete?.lastVerifiedAt ||
            Date.now() - new Date(athlete.lastVerifiedAt).getTime() > 365 * 24 * 60 * 60 * 1000) && (
            <span className="badge rejected">{t("editAthlete.needsRenewal")}</span>
          )}
          <button type="button" className="link-btn" onClick={renewVerification} disabled={renewing}>
            {renewing ? t("editAthlete.renewing") : t("editAthlete.renewVerifiedToday")}
          </button>
          {!isHeadCoach && (
            <Link to={`/admin/athlete/${id}`} className="link-btn">
              {t("editAthlete.backToRecord")}
            </Link>
          )}
        </div>
      </div>
      {isHeadCoach && (
        <p className="help-text" style={{ maxWidth: 640 }}>
          {t("editAthlete.headCoachNotice")} <strong>{t("editAthlete.headCoachNoticePending")}</strong>
          {t("editAthlete.headCoachNoticeRest")}
        </p>
      )}

      {athlete && (
        <div className="card assignments-card" style={{ maxWidth: 640 }}>
          <h3 style={{ marginTop: 0 }}>{t("editAthlete.teamAssignments")}</h3>
          <p className="help-text" style={{ marginTop: -8, marginBottom: 14 }}>
            {t("editAthlete.multiTeamHelp")}
          </p>

          {athlete.assignments.length === 0 && <p className="help-text">{t("editAthlete.noTeamAssigned")}</p>}

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
                        {t(ROLE_LABEL_KEYS[r] ?? r)}
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
                    title={t("editAthlete.jerseyTitle")}
                  />
                  {canManage &&
                    ((roleDrafts[a._id] !== undefined && roleDrafts[a._id] !== a.role) || jerseyIsDirty(a)) && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => saveAssignmentMeta(a)}
                      >
                        {t("editAthlete.save")}
                      </button>
                    )}
                  {a.approvalStatus === "pending" && !a.pendingRemoval && (
                    <span className="badge rejected">{t("editAthlete.pending")}</span>
                  )}
                  {a.pendingRemoval && <span className="badge rejected">{t("editAthlete.removalRequested")}</span>}
                  {!(a.fees || []).length ? (
                    <span className="badge verified">{t("editAthlete.feePaid")}</span>
                  ) : (
                    <span className="badge rejected">
                      {t("editAthlete.owes").replace(
                        "{amount}",
                        a.fees.reduce((sum, f) => sum + (f.amount || 0), 0)
                      )}
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
                              {t("editAthlete.remove")}
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
                        placeholder={t("editAthlete.amountPlaceholder")}
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
                        placeholder={t("editAthlete.forPlaceholder")}
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
                        {t("editAthlete.addFee")}
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
                        {t("editAthlete.approve")}
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => rejectAssignmentAction(a._id)}
                      >
                        {t("editAthlete.reject")}
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
                          {t("editAthlete.confirmRemoval")}
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          disabled={isBusy}
                          onClick={() => rejectAssignmentAction(a._id)}
                        >
                          {t("editAthlete.keep")}
                        </button>
                      </>
                    ) : (
                      <span className="help-text">{t("editAthlete.waitingForAdmin")}</span>
                    )
                  ) : (
                    canManage && (
                      <button
                        type="button"
                        className="link-btn"
                        disabled={isBusy}
                        onClick={() => removeAssignmentAction(a._id, isLast)}
                      >
                        {t("editAthlete.remove")}
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
                    {t(ROLE_LABEL_KEYS[r] ?? r)}
                  </option>
                ))}
              </select>
              <button className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }} disabled={addingAssignment}>
                {addingAssignment ? t("editAthlete.addingEllipsis") : t("editAthlete.addTeamRole")}
              </button>
            </form>
          )}

          {assignmentError && <div className="error-text" style={{ marginTop: 8 }}>{assignmentError}</div>}
        </div>
      )}

      <form className="card" style={{ maxWidth: 640 }} onSubmit={handleSubmit}>
        <div className="field">
          <label>{t("editAthlete.fullName")}</label>
          <input value={form.fullName} onChange={update("fullName")} required />
        </div>
        <div className="field">
          <label>{t("editAthlete.khmerName")}</label>
          <input value={form.khmerName} onChange={update("khmerName")} />
        </div>
        <div className="field">
          <label>{t("editAthlete.dateOfBirth")}</label>
          <input type="date" value={form.dateOfBirth} onChange={update("dateOfBirth")} />
        </div>
        <div className="field">
          <label>{t("editAthlete.gender")}</label>
          <select value={form.gender} onChange={update("gender")}>
            <option value="male">{t("editAthlete.genderMale")}</option>
            <option value="female">{t("editAthlete.genderFemale")}</option>
            <option value="other">{t("editAthlete.genderOther")}</option>
          </select>
        </div>
        <div className="field">
          <label>{t("editAthlete.address")}</label>
          <input value={form.address} onChange={update("address")} />
        </div>
        <div className="field">
          <label>{t("editAthlete.availability")}</label>
          <select value={form.isAvailable} onChange={update("isAvailable")}>
            <option value="true">{t("editAthlete.available")}</option>
            <option value="false">{t("editAthlete.notAvailable")}</option>
          </select>
        </div>
        {isAdmin && (
          <div className="field">
            <label>{t("editAthlete.cardStatus")}</label>
            <select value={form.status} onChange={update("status")}>
              <option value="verified">{t("editAthlete.verified")}</option>
              <option value="unverified">{t("editAthlete.unverified")}</option>
            </select>
          </div>
        )}
        <div className="field">
          <label>{t("editAthlete.photo")}</label>
          {currentPhotoUrl && !photo && (
            <img src={resolveFileUrl(currentPhotoUrl)} alt="Current" className="edit-current-photo" />
          )}
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          <p className="help-text">{t("editAthlete.keepCurrentPhoto")}</p>
        </div>

        <div className="field">
          <label>{t("editAthlete.referenceDocuments")}</label>
          <p className="help-text" style={{ marginTop: -4 }}>
            {t("editAthlete.referenceDocumentsHelp")}
          </p>
          {existingDocs.length > 0 && (
            <ul className="fee-items">
              {existingDocs.map((doc) => (
                <li key={doc._id}>
                  <a href={resolveFileUrl(doc.fileUrl)} target="_blank" rel="noreferrer">
                    {doc.label || t("editAthlete.document")}
                  </a>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={removeDocIds.has(String(doc._id))}
                      onChange={() => toggleRemoveDoc(String(doc._id))}
                    />
                    {t("editAthlete.removeCheckbox")}
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
          <p className="help-text">{t("editAthlete.documentsHelp")}</p>
        </div>

        {error && <div className="error-text">{error}</div>}
        {infoMessage && <p className="help-text">{infoMessage}</p>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? t("editAthlete.saving") : t("editAthlete.saveChanges")}
        </button>
      </form>
    </div>
    </RequireActiveSubscription>
  );
}
