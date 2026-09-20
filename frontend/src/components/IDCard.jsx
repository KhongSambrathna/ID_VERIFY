import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import api from "../api/axios";
import { resolveFileUrl } from "../utils/fileUrl";
import { saveCanvasAsImage } from "../utils/saveCanvasAsImage";
import { useLanguage } from "../i18n/LanguageContext";

// Shared across every IDCard instance on the page (e.g. dozens of cards on
// AllCardsPage) so cards for the same team don't each fire their own
// request for a logo that's already known — a plain module-level cache of
// in-flight/settled promises, keyed by team name. Cleared on a full page
// reload, which is fine: a stale-for-one-session logo is harmless.
const teamLogoCache = new Map();
function fetchTeamLogo(teamName) {
  if (!teamName) return Promise.resolve(null);
  if (!teamLogoCache.has(teamName)) {
    teamLogoCache.set(
      teamName,
      api
        .get(`/teams/logo/${encodeURIComponent(teamName)}`)
        .then(({ data }) => data.logoUrl || null)
        .catch(() => null)
    );
  }
  return teamLogoCache.get(teamName);
}

function formatDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

// One year after `date` — the card's "valid until" is just its last
// in-person verification plus a year, the exact same window the
// "needs renewal" badge elsewhere (AthleteCardPage) already uses, so the
// two never disagree with each other.
function addOneYear(date) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export default function IDCard({ athlete, hideActions }) {
  const { t } = useLanguage();
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [teamLogoUrl, setTeamLogoUrl] = useState(null);

  // Generated in the browser, per athlete, from whatever domain the card is
  // actually being viewed on (window.location.origin) — e.g.
  // https://id-verify-liart.vercel.app/verify/<verifyId>. This replaced a
  // single shared static QR image that pointed at the generic search page:
  // that was a stand-in put in because the SERVER-side QR (baked into a
  // Cloudinary image at register time, from generateAthleteQR.js) depended
  // on the backend's PUBLIC_BASE_URL env var being set correctly, and broke
  // silently whenever it wasn't. Building it client-side removes that
  // dependency entirely — it can never point at the wrong domain, and every
  // card's QR jumps straight to that one athlete's own verify page.
  useEffect(() => {
    if (!athlete?.verifyId) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    const verifyUrl = `${window.location.origin}/verify/${athlete.verifyId}`;
    QRCode.toDataURL(verifyUrl, { width: 200, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => console.error("Failed to generate QR code:", err));
    return () => {
      cancelled = true;
    };
  }, [athlete?.verifyId]);

  // The team crest shown next to the QR code — looked up by team name (the
  // Team collection is the single source of truth for it, same as the KHQR
  // payment image), so it stays correct even for athletes created long
  // before a team ever had a logo on file.
  useEffect(() => {
    if (!athlete?.team) {
      setTeamLogoUrl(null);
      return;
    }
    let cancelled = false;
    fetchTeamLogo(athlete.team).then((url) => {
      if (!cancelled) setTeamLogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [athlete?.team]);

  if (!athlete) return null;

  const dob = formatDob(athlete.dateOfBirth);
  const issuedDate = formatDob(athlete.createdAt);
  const validUntilDate = athlete.lastVerifiedAt ? formatDob(addOneYear(athlete.lastVerifiedAt)) : null;

  const saveAsJpg = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 3, // higher resolution than the on-screen card
        backgroundColor: "#ffffff",
      });
      await saveCanvasAsImage(canvas, `${athlete.verifyId || athlete.fullName || "id-card"}.jpg`);
    } catch (err) {
      console.error("Failed to save card as JPG:", err);
      alert(t("idCard.couldNotSaveJpg"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="id-card-print-page">
      {!hideActions && (
        <div className="id-card-actions no-print">
          <button className="btn btn-primary" onClick={() => window.print()}>
            {t("idCard.exportPrint")}
          </button>
          <button
            className="btn btn-outline card-jpg-btn"
            style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
            onClick={saveAsJpg}
            disabled={saving}
          >
            {saving ? t("common.saving") : t("idCard.saveAsJpg")}
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
              <div className="value-en caps-display">NAME : {athlete.fullName}</div>
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
                <span className="value-en caps-display">{athlete.team || "—"}</span>
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
          </div>

          <div className="id-card-footer">
            <div className="id-card-issue-info">
              <div>id-verify-liart.vercel.app</div>
              {issuedDate && <div>ISSUED: {issuedDate}</div>}
              <div>VALID: {validUntilDate || "PENDING"}</div>
            </div>

            <div className="id-card-qr-corner">
              {teamLogoUrl && (
                <div className="id-card-logo-block">
                  <img
                    className="id-card-team-logo"
                    crossOrigin="anonymous"
                    src={resolveFileUrl(teamLogoUrl)}
                    alt={`${athlete.team} logo`}
                  />
                  <div className="scan-label">Club Logo</div>
                </div>
              )}
              <div className="id-card-qr-block">
                {qrDataUrl && <img src={qrDataUrl} alt={`Scan to view ${athlete.fullName}`} />}
                <div className="scan-label">Scan To Verify</div>
              </div>
            </div>
          </div>

          <div className="id-card-tagline">
            <p>
              កត់ត្រា ផ្ទៀងផ្ទាត់ និងផលិតកាតសម្គាល់សម្រាប់កីឡាករ គ្រប់រូបក្នុងកម្មវិធីរបស់អ្នក
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
