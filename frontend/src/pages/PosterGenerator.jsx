import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Same site link + brand palette used on the public Pricing page and the
// Facebook content-calendar posters, so every poster the app produces —
// hand-made or admin-generated — looks like it came from the same place.
const SITE = "id-verify-liart.vercel.app";
const NAVY = "#10233f";
const NAVY_DEEP = "#0a1830";
const GOLD = "#d8a34e";
const CREAM = "#f6f3ec";

// The on-screen poster renders at half size (540x540) and is captured with
// html2canvas's `scale: 2` option — the exact same "smaller on screen,
// higher-resolution export" pattern IDCard.jsx and AllCardsPage.jsx already
// use for ID cards, just applied to a square 1080x1080 Facebook-post canvas.
const DISPLAY_SIZE = 540;
const EXPORT_SCALE = 2;

const PLAN_LABEL_KEY = {
  BASIC: "pricingPage.planBasic",
  PRO: "pricingPage.planPro",
  PRO_MAX: "pricingPage.planProMax",
  UNLIMITED: "pricingPage.planUnlimited",
};

// A generic shield-check glyph — this poster type is the "general
// marketing" one (trust / official-club messaging), not tied to any one
// feature, so a single consistent icon is used rather than a picker.
const ShieldIcon = () => (
  <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

function sanitizeFilename(s) {
  return (s || "poster")
    .toString()
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_");
}

export default function PosterGenerator() {
  const { t } = useLanguage();
  const posterRef = useRef(null);

  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamsError, setTeamsError] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const defaultHeadline = t("posterGenerator.defaultHeadline");
  const defaultSubheading = t("posterGenerator.defaultSubheading");
  const teamSubheading = t("posterGenerator.teamSubheading");

  const [badgeText, setBadgeText] = useState(t("posterGenerator.defaultBadge"));
  const [headline, setHeadline] = useState(defaultHeadline);
  const [subheading, setSubheading] = useState(defaultSubheading);
  const [tagline, setTagline] = useState("#CountrysideFootball #IDVerify");
  const [showStats, setShowStats] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .get("/teams")
      .then(({ data }) => setTeams(data))
      .catch((err) => setTeamsError(err.response?.data?.message || t("posterGenerator.failedToLoadTeams")))
      .finally(() => setLoadingTeams(false));
  }, []);

  const selectedTeam = teams.find((tm) => tm._id === selectedTeamId) || null;

  // Pulls the picked team's own data (name, player count, plan) straight
  // into the poster text — per the request, admin fills this by choosing a
  // team rather than typing everything from scratch. Switching teams
  // re-fills the suggested text; the admin can still edit every field
  // afterwards before downloading.
  const handleTeamChange = (id) => {
    setSelectedTeamId(id);
    const team = teams.find((tm) => tm._id === id);
    if (team) {
      setHeadline(team.name);
      setSubheading(teamSubheading);
    } else {
      setHeadline(defaultHeadline);
      setSubheading(defaultSubheading);
    }
  };

  const planLabel = selectedTeam?.subscriptionPlan ? t(PLAN_LABEL_KEY[selectedTeam.subscriptionPlan]) : null;
  const playerCount = selectedTeam?.playerCount ?? null;

  const downloadPng = async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(posterRef.current, {
        useCORS: true,
        scale: EXPORT_SCALE,
        backgroundColor: null,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("render failed");
      const name = `poster-${sanitizeFilename(selectedTeam?.name || headline)}-${new Date().toISOString().slice(0, 10)}.png`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = name;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(t("posterGenerator.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("posterGenerator.title")}</h2>
        <div className="dash-actions">
          <Link to="/admin" className="link-btn">
            {t("posterGenerator.backToDashboard")}
          </Link>
        </div>
      </div>
      <p className="help-text" style={{ marginTop: -8 }}>
        {t("posterGenerator.subtitle")}
      </p>

      {teamsError && <p className="error-text">{teamsError}</p>}

      <div className="poster-gen-layout">
        <div className="poster-gen-controls">
          <div className="field">
            <label>{t("posterGenerator.teamLabel")}</label>
            <select value={selectedTeamId} onChange={(e) => handleTeamChange(e.target.value)} disabled={loadingTeams}>
              <option value="">{t("posterGenerator.noTeam")}</option>
              {teams.map((tm) => (
                <option key={tm._id} value={tm._id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>{t("posterGenerator.badgeLabel")}</label>
            <input type="text" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} maxLength={40} />
          </div>

          <div className="field">
            <label>{t("posterGenerator.headlineLabel")}</label>
            <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} />
          </div>

          <div className="field">
            <label>{t("posterGenerator.subheadingLabel")}</label>
            <textarea rows={3} value={subheading} onChange={(e) => setSubheading(e.target.value)} maxLength={220} />
          </div>

          <div className="field">
            <label>{t("posterGenerator.taglineLabel")}</label>
            <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} />
          </div>

          {selectedTeam && (playerCount !== null || planLabel) && (
            <div className="field poster-gen-stats-toggle">
              <label className="poster-gen-checkbox-label">
                <input type="checkbox" checked={showStats} onChange={(e) => setShowStats(e.target.checked)} />
                {t("posterGenerator.showStatsLabel")}
              </label>
            </div>
          )}

          <button type="button" className="btn btn-primary" onClick={downloadPng} disabled={exporting}>
            {exporting ? t("posterGenerator.downloading") : t("posterGenerator.downloadBtn")}
          </button>
        </div>

        <div className="poster-gen-canvas-wrap">
          <div
            ref={posterRef}
            style={{
              width: DISPLAY_SIZE,
              height: DISPLAY_SIZE,
              boxSizing: "border-box",
              background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
              display: "flex",
              flexDirection: "column",
              padding: "44px 48px",
              fontFamily: "'Siemreap', sans-serif",
              position: "relative",
              overflow: "hidden",
              borderRadius: 4,
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 5, background: GOLD }} />
            <div
              style={{
                position: "absolute",
                bottom: -70,
                right: -70,
                width: 210,
                height: 210,
                borderRadius: "50%",
                background: "rgba(216,163,78,0.07)",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD }} />
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  fontSize: 11,
                  color: GOLD,
                  textTransform: "uppercase",
                }}
              >
                Countryside Football &middot; ID Verify
              </span>
            </div>

            {badgeText && (
              <div style={{ marginTop: 28, display: "inline-flex", alignSelf: "flex-start" }}>
                <span
                  style={{
                    background: "rgba(216,163,78,0.14)",
                    border: `1px solid ${GOLD}`,
                    color: GOLD,
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    padding: "5px 11px",
                    borderRadius: 999,
                  }}
                >
                  {badgeText}
                </span>
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: CREAM,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ShieldIcon />
            </div>

            <h1
              style={{
                margin: "22px 0 0 0",
                fontFamily: "'Moul', serif",
                fontWeight: 400,
                fontSize: 28,
                lineHeight: 1.32,
                color: CREAM,
                maxWidth: 430,
                wordBreak: "break-word",
              }}
            >
              {headline || defaultHeadline}
            </h1>

            <p
              style={{
                margin: "14px 0 0 0",
                fontFamily: "'Siemreap', sans-serif",
                fontSize: 15,
                lineHeight: 1.55,
                color: "rgba(246,243,236,0.82)",
                maxWidth: 410,
              }}
            >
              {subheading}
            </p>

            {selectedTeam && showStats && (playerCount !== null || planLabel) && (
              <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {playerCount !== null && (
                  <span
                    style={{
                      background: "rgba(246,243,236,0.1)",
                      color: CREAM,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(246,243,236,0.25)",
                    }}
                  >
                    {t("posterGenerator.playersCount").replace("{n}", playerCount)}
                  </span>
                )}
                {planLabel && (
                  <span
                    style={{
                      background: "rgba(216,163,78,0.14)",
                      color: GOLD,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: `1px solid ${GOLD}`,
                    }}
                  >
                    {planLabel}
                  </span>
                )}
              </div>
            )}

            <div style={{ flexGrow: 1 }} />

            <div
              style={{
                borderTop: "1px solid rgba(216,163,78,0.35)",
                paddingTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              <span
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 15,
                  fontWeight: 600,
                  color: GOLD,
                  letterSpacing: "0.02em",
                }}
              >
                {SITE}
              </span>
              {tagline && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: "rgba(246,243,236,0.55)" }}>
                  {tagline}
                </span>
              )}
            </div>
          </div>
          <p className="help-text poster-gen-export-note">{t("posterGenerator.exportNote")}</p>
        </div>
      </div>
    </div>
  );
}
