import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import TeamSelect from "../components/TeamSelect";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "HEAD_COACH", label: "Head Coach" },
  { value: "PLAYER", label: "Player (read-only, shared)" },
];

const ROLE_LABELS = { HEAD_COACH: "Head Coach", PLAYER: "Player", ADMIN: "Admin" };

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "HEAD_COACH",
    team: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/auth/users");
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      await api.post("/auth/users", {
        username: form.username,
        password: form.password,
        role: form.role,
        team: form.role === "HEAD_COACH" || form.role === "PLAYER" ? form.team : undefined,
      });
      setForm({ username: "", password: "", role: "HEAD_COACH", team: "" });
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this user login? They won't be able to sign in anymore.")) return;
    try {
      await api.delete(`/auth/users/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete user");
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Users &amp; roles</h2>
        <p>
          Create Head Coach logins so coaches can build their own team's lineups — they can only pull
          athletes already registered in their team, never add new ones. Create a Player login (one shared
          account per team) so players can view their team's roster and fee/debt status — read-only, no
          editing.
        </p>
      </div>

      <form className="card" style={{ maxWidth: 480, marginBottom: 24 }} onSubmit={handleCreate}>
        <h3 style={{ marginTop: 0 }}>Create new user</h3>
        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={update("username")} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={update("password")} required />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={update("role")}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {(form.role === "HEAD_COACH" || form.role === "PLAYER") && (
          <TeamSelect value={form.team} onChange={(team) => setForm({ ...form, team })} required />
        )}
        {form.role === "PLAYER" && (
          <p className="help-text" style={{ marginTop: -8 }}>
            One shared login for every player on this team — they can see the whole team's roster and
            fee/debt status, but can never add, edit, or remove anything.
          </p>
        )}
        {formError && <div className="error-text">{formError}</div>}
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Creating…" : "Create user"}
        </button>
      </form>

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <div className="table-scroll">
          <table className="athletes">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Team</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td data-label="Username">{u.username}</td>
                  <td data-label="Role">{ROLE_LABELS[u.role] || "Admin"}</td>
                  <td data-label="Team">{u.team || "—"}</td>
                  <td data-label="Actions" className="actions-cell">
                    {u._id !== currentUser?.id && (
                      <button className="link-btn" onClick={() => remove(u._id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "#777" }}>
                    No users yet.
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
