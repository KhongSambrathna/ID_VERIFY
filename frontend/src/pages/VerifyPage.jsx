import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";

const STATUS_LABEL = {
  verified: { icon: "✅", text: "Verified athlete", cls: "verified" },
  unverified: { icon: "⏳", text: "Not yet verified", cls: "pending" },
};

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
            <h2>{athlete.fullName}</h2>
            {athlete.khmerName && <p>{athlete.khmerName}</p>}
            <p>
              {athlete.team} {athlete.role && `· ${athlete.role}`}
            </p>
            {athlete.address && <p>{athlete.address}</p>}
            <span className={`badge ${STATUS_LABEL[athlete.status].cls}`}>
              {STATUS_LABEL[athlete.status].text}
            </span>
            <div style={{ marginTop: 10 }}>
              <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                {athlete.isAvailable ? "Available" : "Not available"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
