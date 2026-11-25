import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { canPromptInstall, isInstalled, onInstallAvailable, platform, promptInstall } from "../utils/installPrompt";

// Welcome guide for new users: a few short slides on what this account can
// do (different for Admin / Head Coach / Player / Referee), ending with how
// to install the app on the phone. Opens by itself the first time an account
// signs in on this device; reopen any time from the account menu
// (❓ How to use) — it listens for the "open-guide" window event.
const STEPS = {
  ADMIN: [
    { icon: "👋", k: "welcomeAdmin" },
    { icon: "👥", k: "athletes", to: "/admin" },
    { icon: "🔗", k: "regLinks", to: "/admin?tab=registration" },
    { icon: "🏆", k: "competitions", to: "/admin/tournaments" },
    { icon: "🛒", k: "shop", to: "/admin/invoices" },
    { icon: "💳", k: "khqrAdmin", to: "/admin/khqr" },
    { icon: "📉", k: "debts", to: "/debt-report" },
    { icon: "🔔", k: "telegram", to: "/settings" },
  ],
  HEAD_COACH: [
    { icon: "👋", k: "welcomeCoach" },
    { icon: "👥", k: "coachRoster", to: "/coach" },
    { icon: "📋", k: "attendance", to: "/coach?tab=attendance" },
    { icon: "🏆", k: "coachTournaments", to: "/admin/tournaments" },
    { icon: "📉", k: "debts", to: "/debt-report" },
    { icon: "🔔", k: "telegram", to: "/settings" },
  ],
  PLAYER: [
    { icon: "👋", k: "welcomePlayer" },
    { icon: "✏️", k: "playerProfile", to: "/player/edit" },
    { icon: "🏆", k: "playerTournaments", to: "/tournaments" },
    { icon: "💳", k: "playerPay", to: "/player" },
    { icon: "🔔", k: "playerTelegram", to: "/settings" },
  ],
  REFEREE: [
    { icon: "👋", k: "welcomeReferee" },
    { icon: "📅", k: "refSchedule", to: "/referee" },
    { icon: "🔔", k: "telegram", to: "/settings" },
  ],
};

const seenKey = (u) => `guideSeen:${u}`;

export default function WelcomeGuide() {
  const { t } = useLanguage();
  const { isAuthed, user, mustChangePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  const [installMsg, setInstallMsg] = useState("");

  const role = user?.role || "ADMIN";
  const steps = [...(STEPS[role] || STEPS.ADMIN), { icon: "📲", k: "install", install: true }];

  // First sign-in on this device → open by itself (after the forced
  // password change, if there is one).
  useEffect(() => {
    if (!isAuthed || !user?.username || mustChangePassword) return;
    let seen = false;
    try {
      seen = Boolean(localStorage.getItem(seenKey(user.username)));
    } catch {
      seen = true;
    }
    if (!seen) {
      setI(0);
      setOpen(true);
    }
  }, [isAuthed, user?.username, mustChangePassword]);

  // Reopen from the account menu; jump straight to install with detail "install".
  useEffect(() => {
    const h = (e) => {
      setI(e.detail === "install" ? steps.length - 1 : 0);
      setOpen(true);
    };
    window.addEventListener("open-guide", h);
    return () => window.removeEventListener("open-guide", h);
  });

  useEffect(() => onInstallAvailable(setCanInstall), []);

  const close = () => {
    try {
      if (user?.username) localStorage.setItem(seenKey(user.username), "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    setInstallMsg("");
  };

  if (!open || !isAuthed) return null;
  const s = steps[i];
  const last = i === steps.length - 1;
  const p = platform();

  const install = async () => {
    const r = await promptInstall();
    setInstallMsg(r === "accepted" ? t("guide.installDone") : r === "dismissed" ? "" : t("guide.installManual"));
  };

  return (
    <div className="guide-backdrop" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="guide-card">
        <button type="button" className="guide-x" aria-label="close" onClick={close}>
          ✕
        </button>
        <div className="guide-icon">{s.icon}</div>
        <h3>{t(`guide.${s.k}.title`)}</h3>

        {s.install ? (
          <div className="guide-body">
            {isInstalled() ? (
              <p>✅ {t("guide.installAlready")}</p>
            ) : (
              <>
                <p>{t("guide.install.text")}</p>
                {canInstall && (
                  <button type="button" className="btn btn-primary" style={{ margin: "4px 0 10px" }} onClick={install}>
                    📲 {t("guide.installNow")}
                  </button>
                )}
                {installMsg && <p className="success-text">{installMsg}</p>}
                <div className={`guide-os ${p === "android" ? "mine" : ""}`}>
                  <b>🤖 Android (Chrome)</b>
                  <ol>
                    <li>{t("guide.android1")}</li>
                    <li>{t("guide.android2")}</li>
                    <li>{t("guide.android3")}</li>
                  </ol>
                </div>
                <div className={`guide-os ${p === "ios" ? "mine" : ""}`}>
                  <b>🍎 iPhone / iPad (Safari)</b>
                  <ol>
                    <li>{t("guide.ios1")}</li>
                    <li>{t("guide.ios2")}</li>
                    <li>{t("guide.ios3")}</li>
                  </ol>
                </div>
                <div className={`guide-os ${p === "desktop" ? "mine" : ""}`}>
                  <b>💻 {t("guide.desktop")}</b>
                  <ol>
                    <li>{t("guide.desktop1")}</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="guide-body">
            <p>{t(`guide.${s.k}.text`)}</p>
            {s.to && (
              <Link to={s.to} className="guide-go" onClick={close}>
                {t("guide.goThere")} →
              </Link>
            )}
          </div>
        )}

        <div className="guide-dots">
          {steps.map((_, n) => (
            <button key={n} type="button" className={n === i ? "on" : ""} aria-label={`${n + 1}`} onClick={() => setI(n)} />
          ))}
        </div>
        <div className="guide-nav">
          {i > 0 ? (
            <button type="button" className="btn btn-outline" onClick={() => setI(i - 1)}>
              ← {t("guide.back")}
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={close}>
              {t("guide.skip")}
            </button>
          )}
          {last ? (
            <button type="button" className="btn btn-primary" onClick={close}>
              {t("guide.done")} ✓
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)}>
              {t("guide.next")} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
