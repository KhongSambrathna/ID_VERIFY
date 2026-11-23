import { useRef, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import Avatar from "./Avatar";

// Settings → "My profile": the name and photo shown in the top bar.
export default function ProfileCard() {
  const { t } = useLanguage();
  const { user, login } = useAuth();
  const p = user?.profile || {};
  const [name, setName] = useState(user?.displayName || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const done = (data) => {
    login(localStorage.getItem("token"), data);
    setMsg(t("profile.saved"));
  };

  const saveName = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const { data } = await api.put("/auth/me/profile", { displayName: name });
      done(data);
    } catch (e2) {
      setErr(e2.response?.data?.message || t("common.failedToSave"));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const { data } = await api.put("/auth/me/photo", fd);
      done(data);
    } catch (e2) {
      setErr(e2.response?.data?.message || t("common.failedToSave"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const removePhoto = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete("/auth/me/photo");
      done(data);
    } catch (e2) {
      setErr(e2.response?.data?.message || t("common.failedToSave"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" style={{ maxWidth: 420, marginBottom: 24 }} onSubmit={saveName}>
      <h4 style={{ marginTop: 0 }}>{t("profile.title")}</h4>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
        <Avatar name={p.name || user?.username} photoUrl={p.photoUrl} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <b style={{ overflowWrap: "anywhere" }}>{p.name || user?.username}</b>
          <small className="mini-empty">@{user?.username}</small>
          <span>
            <button type="button" className="link-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              📷 {user?.photoUrl ? t("profile.changePhoto") : t("profile.addPhoto")}
            </button>
            {user?.photoUrl && (
              <button type="button" className="link-btn" disabled={busy} onClick={removePhoto} style={{ marginLeft: 8 }}>
                {t("profile.removePhoto")}
              </button>
            )}
          </span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
      <div className="field">
        <label>{t("profile.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={p.name || user?.username} maxLength={60} />
        {user?.athleteId && <small className="mini-empty">{t("profile.playerHint")}</small>}
      </div>
      {err && <p className="error-text">{err}</p>}
      {msg && <p className="success-text">✅ {msg}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</button>
    </form>
  );
}
