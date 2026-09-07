import { useState } from "react";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    role: "ADMIN",
    team: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (!formData.username.trim()) {
      setError("Username is required");
      return;
    }
    if (formData.username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (!formData.password) {
      setError("Password is required");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (formData.role === "HEAD_COACH" && !formData.team.trim()) {
      setError("Team name is required for Head Coach");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/auth/register", {
        username: formData.username,
        password: formData.password,
        role: formData.role,
        team: formData.role === "HEAD_COACH" ? formData.team : null,
      });

      setSuccess(`✅ ${response.data.message}`);
      
      // Clear form
      setFormData({
        username: "",
        password: "",
        confirmPassword: "",
        role: "ADMIN",
        team: "",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/admin/login");
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Create New Account</h2>
        <p className="auth-subtitle">Add a new admin or head coach account</p>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>
            <input
              type="text"
              name="username"
              placeholder="Enter username"
              value={formData.username}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              name="password"
              placeholder="Enter password (min 6 characters)"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field">
            <label>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="field">
            <label>Role</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={loading}
            >
              <option value="ADMIN">Admin (Can add/edit athletes)</option>
              <option value="HEAD_COACH">Head Coach (Can create lineups)</option>
            </select>
          </div>

          {formData.role === "HEAD_COACH" && (
            <div className="field">
              <label>Team Name</label>
              <input
                type="text"
                name="team"
                placeholder="e.g., Football Team A"
                value={formData.team}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Go back to <a href="/admin/login">Login</a>
          </p>
        </div>
      </div>
    </div>
  );
}
