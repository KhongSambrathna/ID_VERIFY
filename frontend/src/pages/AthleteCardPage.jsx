import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api/axios";
import IDCard from "../components/IDCard";

export default function AthleteCardPage() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/athletes/${id}`)
      .then(({ data }) => setAthlete(data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load"));
  }, [id]);

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      <div className="dash-header">
        <h2>Athlete ID card</h2>
        <Link to="/admin" className="link-btn">
          ← Back to dashboard
        </Link>
      </div>
      {error && <p className="error-text">{error}</p>}
      {athlete && (
        <div className="cards-grid">
          <IDCard athlete={athlete} />
        </div>
      )}
    </div>
  );
}
