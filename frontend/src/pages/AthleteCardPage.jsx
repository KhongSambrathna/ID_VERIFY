import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import html2canvas from "html2canvas";
import api from "../api/axios";
import IDCard from "../components/IDCard";
import { resolveFileUrl } from "../utils/fileUrl";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function AthleteCardPage() {
  const { id } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const exportWrapRef = useRef(null);

  useEffect(() => {
    api
      .get(`/athletes/${id}`)
      .then(({ data }) => setAthlete(data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load"));
  }, [id]);

  const handleSaveAsJpg = async () => {
    const cardNode = exportWrapRef.current?.querySelector(".id-card");
    if (!cardNode) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardNode, {
        useCORS: true,
        scale: 3,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `${athlete.verifyId || athlete.fullName || "id-card"}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (err) {
      console.error("Failed to save card as JPG:", err);
      alert("Couldn't save the card as an image. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ paddingBottom: 60 }}>
      {/* Plain data view — this is what shows on screen. The actual branded
          ID card is only rendered when exporting (print or save-as-JPG),
          via the hidden card below. */}
      <div className="dash-header no-print">
        <h2>Athlete record</h2>
        <Link to="/admin" className="link-btn">
          ← Back to dashboard
        </Link>
      </div>

      {error && <p className="error-text no-print">{error}</p>}

      {athlete && (
        <>
          <div className="athlete-detail card no-print">
            <div className="athlete-detail-top">
              <img
                className="athlete-detail-photo"
                src={
                  athlete.photoUrl
                    ? resolveFileUrl(athlete.photoUrl)
                    : "https://placehold.co/120x150?text=Photo"
                }
                alt={athlete.fullName}
              />
              <div>
                <h3 style={{ margin: "0 0 2px" }}>{athlete.fullName}</h3>
                {athlete.khmerName && <p className="khmer-name">{athlete.khmerName}</p>}
                <p className="verify-id">ID: {athlete.verifyId}</p>
                <div className="athlete-detail-badges">
                  <span className={`badge ${athlete.status}`}>{athlete.status}</span>
                  <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                    {athlete.isAvailable ? "Available" : "Not available"}
                  </span>
                </div>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">Date of birth</div>
                <div className="detail-value">{formatDob(athlete.dateOfBirth) || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Gender</div>
                <div className="detail-value">{athlete.gender || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Team</div>
                <div className="detail-value">{athlete.team || "—"}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Role</div>
                <div className="detail-value">{athlete.role || "—"}</div>
              </div>
              <div className="detail-item detail-item-wide">
                <div className="detail-label">Address</div>
                <div className="detail-value">{athlete.address || "—"}</div>
              </div>
            </div>

            <div className="dash-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={() => window.print()}>
                Export / Print card
              </button>
              <button
                className="btn btn-outline"
                style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
                onClick={handleSaveAsJpg}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save as JPG"}
              </button>
            </div>
          </div>

          {/* Hidden on screen (off-canvas, still fully rendered so print /
              html2canvas can use it); becomes the visible content when printing. */}
          <div className="card-export-target" ref={exportWrapRef}>
            <div className="cards-grid">
              <IDCard athlete={athlete} hideActions />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
