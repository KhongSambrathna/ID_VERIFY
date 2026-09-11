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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Per-assignment UI state: a draft role while editing, and a per-row
  // "this one's request is in flight" flag so only that row shows "Saving…".
  const [roleDrafts, setRoleDrafts] = useState({});
  const [busyAssignmentId, setBusyAssignmentId] = useState(null);
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
        setRoleDrafts({});
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load athlete"));
  };

  useEffect(() => {
    loadAthlete().finally(() => setLoading(false));
  }, [id]);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (photo) data.append("photo", photo);

      await api.put(`/athletes/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
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

  const saveRole = async (assignmentId) => {
    setAssignmentError("");
    setBusyAssignmentId(assignmentId);
    try {
      const { data } = await api.put(`/athletes/${id}/assignments/${assignmentId}`, {
        role: roleDrafts[assignmentId],
      });
      afterAssignmentChange(data);
    } catch (err) {
      setAssignmentError(err.response?.data?.message || "Failed to update role");
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
        {!isHeadCoach && (
          <Link to={`/admin/athlete/${id}`} className="link-btn">
            ← Back to record
          </Link>
        )}
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
                  {canManage && roleDrafts[a._id] !== undefined && roleDrafts[a._id] !== a.role && (
                    <button
                      type="button"
                      className="link-btn"
                      disabled={isBusy}
                      onClick={() => saveRole(a._id)}
                    >
                      Save role
                    </button>
                  )}
                  {a.approvalStatus === "pending" && !a.pendingRemoval && (
                    <span className="badge rejected">Pending</span>
                  )}
                  {a.pendingRemoval && <span className="badge rejected">Removal requested</span>}
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

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
