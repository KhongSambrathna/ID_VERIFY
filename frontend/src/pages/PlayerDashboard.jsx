import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { resolveFileUrl } from "../utils/fileUrl";
import { useLanguage } from "../i18n/LanguageContext";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// Read-only team roster for the shared Player login — one account for
// everyone on a team, so there's no "my own record" to single out; this
// shows every teammate, same as a Head Coach's "My Team" tab, but with
// nothing to click except "View card". Fee/debt info is visible here (that's
// the whole point of this account existing) but never editable — the
// backend never lets a PLAYER-role account past a GET request.
export default function PlayerDashboard() {
  const { t } = useLanguage();
  const { team, athleteId } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Only the total shows by default — the itemized breakdown (what each fee
  // is for) only appears once someone clicks the total for that person.
  const [expandedIds, setExpandedIds] = useState(new Set());
  // Which card has its "how to pay" panel open, keyed by assignmentId.
  const [payOpenIds, setPayOpenIds] = useState(new Set());

  // This team's static ABA Merchant KHQR image (see backend/models/Team.js)
  // — the whole team shares one QR, same as the fee itself is team-scoped,
  // so this is fetched once, not per athlete card. No amount is embedded in
  // it: whoever scans has to type the amount themselves, then tell their
  // coach/admin so it gets recorded (Debt report → "ABA (KHQR)").
  const [khqrImageUrl, setKhqrImageUrl] = useState(null);
  const [khqrLoading, setKhqrLoading] = useState(true);

  const toggleExpanded = (assignmentId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  const togglePayOpen = (athlete) => {
    setPayOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(athlete.assignmentId)) next.delete(athlete.assignmentId);
      else next.add(athlete.assignmentId);
      return next;
    });
  };

  useEffect(() => {
    api
      .get("/athletes")
      .then(({ data }) => {
        setAthletes(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message || t("playerDashboard.failedToLoadRoster")))
      .finally(() => setLoading(false));
    api
      .get("/teams/mine/khqr")
      .then(({ data }) => setKhqrImageUrl(data.khqrImageUrl || null))
      .catch(() => {
        // Leave it blank rather than blocking the rest of the dashboard.
      })
      .finally(() => setKhqrLoading(false));
  }, []);

  const filteredAthletes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return athletes;
    return athletes.filter((a) =>
      [a.fullName, a.khmerName, a.role, a.verifyId].filter(Boolean).some((field) => field.toLowerCase().includes(q))
    );
  }, [athletes, search]);

  if (loading) return <div className="container"><p>{t("common.loading")}</p></div>;
  if (error) return <div className="container"><p className="error-text">{error}</p></div>;

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{team ? `${team} — ${t("playerDashboard.teamRoster")}` : t("playerDashboard.teamRoster")}</h2>
        <p>{t("playerDashboard.description")}</p>
        {athleteId && (
          <Link to="/player/edit" className="btn btn-outline" style={{ color: "var(--navy)", borderColor: "var(--navy)" }}>
            {t("playerDashboard.editMyProfile")}
          </Link>
        )}
      </div>

      {athletes.length > 0 && (
        <div className="field search-field">
          <input
            placeholder={t("playerDashboard.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {athletes.length === 0 ? (
        <p>{t("playerDashboard.noAthletes")}</p>
      ) : filteredAthletes.length === 0 ? (
        <p>{t("playerDashboard.noSearchMatches")}</p>
      ) : (
        <div className="athletes-grid">
          {filteredAthletes.map((athlete) => (
            <div key={athlete.assignmentId} className="athlete-card">
              <img
                src={
                  athlete.photoUrl
                    ? resolveFileUrl(athlete.photoUrl)
                    : "https://placehold.co/150x150?text=Photo"
                }
                alt={athlete.fullName}
                className="athlete-photo"
              />
              <h4 className="caps-display">{athlete.fullName}</h4>
              {athlete.khmerName && <p className="khmer-name">{athlete.khmerName}</p>}
              <p className="role">{athlete.role || "PLAYER"}</p>
              <p className="verify-id">{t("common.verifyId")}: {athlete.verifyId}</p>
              <p className="athlete-meta">
                {formatDob(athlete.dateOfBirth) || t("playerDashboard.dobDash")} · {athlete.gender || "—"}
              </p>
              <div className="athlete-status">
                <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                  {athlete.isAvailable ? t("common.available") : t("common.notAvailable")}
                </span>
                {athlete.feeOwed > 0 ? (
                  <button
                    type="button"
                    className="badge rejected fee-toggle"
                    onClick={() => toggleExpanded(athlete.assignmentId)}
                  >
                    {t("playerDashboard.owes")} ${athlete.feeOwed} {expandedIds.has(athlete.assignmentId) ? "▲" : "▼"}
                  </button>
                ) : (
                  <span className="badge verified">{t("playerDashboard.feePaid")}</span>
                )}
              </div>
              {athlete.feeOwed > 0 && expandedIds.has(athlete.assignmentId) && (
                <ul className="fee-items" style={{ marginTop: 4 }}>
                  {(athlete.fees || []).map((f) => (
                    <li key={f._id}>
                      <span>
                        ${f.amount}
                        {f.note ? ` — ${f.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {athlete.feeOwed > 0 && (
                <div className="athlete-status" style={{ marginTop: 8 }}>
                  <button type="button" className="link-btn" onClick={() => togglePayOpen(athlete)}>
                    {t("playerDashboard.payBtn")}
                  </button>
                </div>
              )}
              {athlete.feeOwed > 0 && payOpenIds.has(athlete.assignmentId) && (
                <div className="field" style={{ marginTop: 8 }}>
                  {khqrLoading ? (
                    <p className="help-text">{t("common.loading")}</p>
                  ) : khqrImageUrl ? (
                    <>
                      <img
                        src={resolveFileUrl(khqrImageUrl)}
                        alt="ABA KHQR"
                        style={{ width: 180, height: 180, objectFit: "contain", display: "block", marginBottom: 6 }}
                      />
                      <p className="help-text" style={{ margin: 0 }}>
                        {t("playerDashboard.khqrInstructionsPrefix")} <strong>${athlete.feeOwed}</strong>{" "}
                        {t("playerDashboard.khqrInstructionsSuffix")}
                      </p>
                    </>
                  ) : (
                    <p className="help-text" style={{ margin: 0 }}>
                      {t("playerDashboard.khqrNotSetUp")}
                    </p>
                  )}
                </div>
              )}
              <div className="athlete-status" style={{ marginTop: 8 }}>
                <Link className="link-btn" to={`/admin/athlete/${athlete._id}?team=${encodeURIComponent(athlete.team)}`}>
                  {t("common.viewCard")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
