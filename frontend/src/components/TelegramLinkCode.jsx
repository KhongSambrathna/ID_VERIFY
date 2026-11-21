import { useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// "🔗 Telegram code" — makes a one-time 6-digit code (15 min) so the person
// can link their account inside the Telegram bot: 👤 My account → link →
// type username + code, or just tap the "Open Telegram" link.
// `endpoint` = /auth/me/telegram-code (myself), /auth/users/:id/telegram-code
// (Admin) or /auth/player-accounts/:id/telegram-code (Admin / Head Coach).
export default function TelegramLinkCode({ endpoint, compact = false }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const make = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(endpoint);
      setInfo(data);
    } catch (err) {
      setError(err.response?.data?.message || t("tgLink.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!info) {
    return (
      <>
        <button type="button" className={compact ? "link-btn" : "btn btn-primary"} disabled={busy} onClick={make}>
          🔗 {busy ? t("tgLink.making") : compact ? t("tgLink.buttonShort") : t("tgLink.button")}
        </button>
        {error && <div className="error-text">{error}</div>}
      </>
    );
  }

  const until = new Date(info.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="card" style={{ padding: 12, marginTop: 6, textAlign: "left" }}>
      <div>
        {t("tgLink.username")}: <b>{info.username}</b>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, margin: "4px 0" }}>{info.code}</div>
      <div className="help-text" style={{ margin: 0 }}>
        {t("tgLink.validUntil").replace("{time}", until)}
      </div>
      <ol className="help-text" style={{ margin: "8px 0", paddingLeft: 18 }}>
        <li>{t("tgLink.step1").replace("{bot}", info.botUsername ? `@${info.botUsername}` : "bot")}</li>
        <li>{t("tgLink.step2")}</li>
        <li>{t("tgLink.step3")}</li>
      </ol>
      {info.url && (
        <a className="btn btn-outline" href={info.url} target="_blank" rel="noreferrer">
          ✈️ {t("tgLink.openTelegram")}
        </a>
      )}
      <button type="button" className="link-btn" style={{ marginLeft: 10 }} onClick={() => setInfo(null)}>
        {t("common.close")}
      </button>
    </div>
  );
}
