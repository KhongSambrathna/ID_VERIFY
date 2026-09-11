import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";

const STATUS_LABEL = {
  verified: { icon: "✅", text: "Verified athlete", cls: "verified" },
  unverified: { icon: "⏳", text: "Not yet verified", cls: "pending" },
};

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function VerifyPage() {
  const { verifyId } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/athletes/verify/${verifyId}`)
      .then(({ data }) => setAthlete(data))
      .catch((err) => setError(err.response?.data?.message || "Record not found"));
  }, [verifyId]);

  return (
    <div className="verify-wrap">
      <div className="card verify-result">
        {error && (
          <>
            <div className="status-icon">❌</div>
            <h2>Not found</h2>
            <p>{error}</p>
          </>
        )}
        {athlete && (
          <>
            <img
              className="id-card-photo"
              style={{ margin: "0 auto 14px" }}
              src={
                athlete.photoUrl
                  ? resolveFileUrl(athlete.photoUrl)
                  : "https://placehold.co/90x110?text=Photo"
              }
              alt={athlete.fullName}
            />
            <div className="status-icon">{STATUS_LABEL[athlete.status].icon}</div>
            <h2 style={{ marginBottom: 2 }}>{athlete.fullName}</h2>
            {athlete.khmerName && <p style={{ margin: "0 0 4px" }}>{athlete.khmerName}</p>}
            <p className="verify-id" style={{ margin: "0 0 10px" }}>
              ID: {athlete.verifyId}
            </p>

            <span className={`badge ${STATUS_LABEL[athlete.status].cls}`}>
              {STATUS_LABEL[athlete.status].text}
            </span>
            <div style={{ marginTop: 8, marginBottom: 18 }}>
              <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                {athlete.isAvailable ? "Available" : "Not available"}
              </span>
            </div>

            <div className="detail-grid" style={{ textAlign: "left" }}>
              <div className="detail-item">
                <div className="detail-label">Date of birth</div>
                <div className="detail-value">{formatDob(athlete.dateOfBirth) || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Gender</div>
                <div className="detail-value">{athlete.gender || "—"}</div>
              </div>
              {(athlete.memberships?.length
                ? athlete.memberships
                : [{ team: athlete.team, role: athlete.role }]
              ).flatMap((m, i) => [
                <div className="detail-item" key={`team-${i}`}>
                  <div className="detail-label">Team</div>
                  <div className="detail-value">{m.team || "—"}</div>
                </div>,
                <div className="detail-item" key={`role-${i}`}>
                  <div className="detail-label">Role</div>
                  <div className="detail-value">{m.role || "—"}</div>
                </div>,
              ])}
              <div className="detail-item detail-item-wide">
                <div className="detail-label">Address</div>
                <div className="detail-value">{athlete.address || "—"}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
