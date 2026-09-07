import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { resolveFileUrl } from "../utils/fileUrl";

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export default function IDCard({ athlete, hideActions }) {
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);

  if (!athlete) return null;

  const dob = formatDob(athlete.dateOfBirth);

  const saveAsJpg = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 3, // higher resolution than the on-screen card
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
    <div className="id-card-print-page">
      {!hideActions && (
        <div className="id-card-actions no-print">
          <button className="btn btn-primary" onClick={() => window.print()}>
            Export / Print card
          </button>
          <button
            className="btn btn-outline card-jpg-btn"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={saveAsJpg}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save as JPG"}
          </button>
        </div>
      )}

      <div className="id-card-wrap">
        <div className="id-card" ref={cardRef}>
          <div className="id-card-top">
            <div className="org">
              <span className="en">Countryside Football ID Verify</span>
            </div>
          </div>

          <div className="id-card-number">ID: {athlete.verifyId}</div>

          <div className="id-card-photo-wrap">
            <img
              className="id-card-photo"
              crossOrigin="anonymous"
              src={
                athlete.photoUrl
                  ? resolveFileUrl(athlete.photoUrl)
                  : "https://placehold.co/74x90?text=Photo"
              }
              alt={athlete.fullName}
            />
          </div>

          <div className="id-card-fields">
            <div className="id-card-field">
              <div className="value-kh">ឈ្មោះ : {athlete.khmerName || "—"}</div>
              <div className="value-en">NAME : {athlete.fullName}</div>
            </div>

            <div className="id-card-row">
              <div className="id-card-field inline">
                <span className="label">តួនាទី / Role</span>
                <span className="value-en">{athlete.role || "—"}</span>
              </div>
            </div>

            <div className="id-card-row">
              <div className="id-card-field inline">
                <span className="label">ក្រុម / Team</span>
                <span className="value-en">{athlete.team || "—"}</span>
              </div>
            </div>

            <div className="id-card-row">
              <div className="id-card-field">
                <div className="label">ថ្ងៃខែឆ្នាំកំណើត / DOB</div>
                <div className="value-en">{dob || "—"}</div>
              </div>
              <div className="id-card-field">
                <div className="label">ភេទ / Gender</div>
                <div className="value-en">{athlete.gender || "—"}</div>
              </div>
            </div>

            {athlete.address && (
              <div className="id-card-field address">
                <div className="label">អាសយដ្ឋាន / Address</div>
                <div className="value-kh">{athlete.address}</div>
              </div>
            )}

            <div className="id-card-badges">
              <span className={`badge ${athlete.status}`}>{athlete.status}</span>
              <span className={`badge ${athlete.isAvailable ? "verified" : "rejected"}`}>
                {athlete.isAvailable ? "Available" : "Not available"}
              </span>
            </div>
          </div>

          {athlete.qrCodeUrl && (
            <div className="id-card-qr-corner">
              <img crossOrigin="anonymous" src={resolveFileUrl(athlete.qrCodeUrl)} alt="Verification QR code" />
              <div className="scan-label">Scan</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
