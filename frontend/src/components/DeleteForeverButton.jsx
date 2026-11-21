import { useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// "Delete permanently" with a safety step: first loads a preview of
// everything that will be removed (from `previewUrl`), then requires
// typing `confirmName` exactly before calling DELETE `deleteUrl`.
// Admin-only on the server. `kind` = "athlete" | "team" (picks the labels).
const COUNT_KEYS = {
  athlete: ["logins", "attendance", "payments", "scans", "tournaments", "lineups", "jerseyOrders", "files"],
  team: [
    "athletesDeleted",
    "athletesKept",
    "logins",
    "attendance",
    "payments",
    "lineups",
    "formations",
    "startingXIs",
    "invites",
    "tournamentsDeleted",
    "tournamentsUpdated",
    "jerseyOrders",
  ],
};

export default function DeleteForeverButton({ kind, previewUrl, deleteUrl, confirmName, onDeleted, label }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.get(previewUrl);
      setPreview(data);
      setTyped("");
    } catch (err) {
      setError(err.response?.data?.message || t("deleteForever.failed"));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setError("");
    try {
      await api.delete(deleteUrl, { data: { confirmName: typed.trim() } });
      setPreview(null);
      onDeleted?.();
    } catch (err) {
      setError(err.response?.data?.message || t("deleteForever.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (!preview) {
    return (
      <>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={open}>
          {label || t("deleteForever.button")}
        </button>
        {error && <div className="error-text">{error}</div>}
      </>
    );
  }

  const rows = COUNT_KEYS[kind].filter((k) => preview[k] > 0);
  return (
    <div className="card" style={{ borderColor: "#c0392b", marginTop: 8 }}>
      <h4 style={{ marginTop: 0, color: "#c0392b" }}>
        {t(`deleteForever.title_${kind}`).replace("{name}", confirmName)}
      </h4>
      <p>{t("deleteForever.warning")}</p>
      {rows.length > 0 ? (
        <ul>
          {rows.map((k) => (
            <li key={k}>
              {t(`deleteForever.count_${k}`)}: <b>{preview[k]}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="help-text">{t("deleteForever.nothingElse")}</p>
      )}
      <div className="field">
        <label>{t("deleteForever.typeToConfirm").replace("{name}", confirmName)}</label>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmName} />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn btn-danger" disabled={busy || typed.trim() !== confirmName} onClick={doDelete}>
          {busy ? t("deleteForever.deleting") : t("deleteForever.confirmButton")}
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setPreview(null)}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
