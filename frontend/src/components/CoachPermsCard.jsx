import { useState } from "react";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// On the Teams page: switch what this team's Head Coach may do.
// Saved as soon as a switch is flipped (backend: PUT /teams/:id/coach-perms).
export const PERM_KEYS = ["athletes", "debts", "tournaments", "invites", "jersey"];
const DEFAULTS = { athletes: true, debts: true, tournaments: true, invites: false, jersey: true };

export default function CoachPermsCard({ team, coaches = [], onSaved }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState({ ...DEFAULTS, ...(team.coachPerms || {}) });
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");
  const offCount = PERM_KEYS.filter((k) => perms[k] === false).length;

  const flip = async (key) => {
    const next = { ...perms, [key]: !perms[key] };
    setPerms(next);
    setSaving(key);
    setMsg("");
    try {
      const { data } = await api.put(`/teams/${team._id}/coach-perms`, { [key]: next[key] }, { noCoachMode: true });
      setPerms({ ...DEFAULTS, ...data.coachPerms });
      setMsg(t("coachPerms.saved"));
      onSaved?.();
    } catch (err) {
      setPerms(perms);
      setMsg(err.response?.data?.message || t("coachPerms.failed"));
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="coach-perms">
      <button type="button" className="coach-perms-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        🔐 {t("coachPerms.title")}
        <span className="coach-perms-summary">
          {offCount ? t("coachPerms.offCount").replace("{n}", offCount) : t("coachPerms.allOn")}
        </span>
        <span className="nav-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="coach-perms-body">
          <div className="help-text" style={{ margin: "0 0 8px" }}>
            {coaches.length
              ? `🧢 ${t("coachPerms.coaches")}: ${coaches.map((c) => c.fullName || c.username).join(", ")}`
              : t("coachPerms.noCoach")}
          </div>
          {PERM_KEYS.map((k) => (
            <label key={k} className="coach-perm-row">
              <span className="coach-perm-text">
                <b>{t(`coachPerms.${k}`)}</b>
                <span>{t(`coachPerms.${k}Hint`)}</span>
              </span>
              <span className={`switch ${perms[k] ? "on" : ""}`}>
                <input type="checkbox" checked={!!perms[k]} disabled={saving === k} onChange={() => flip(k)} />
                <span className="switch-knob" />
              </span>
            </label>
          ))}
          {msg && <div className="help-text" style={{ margin: "6px 0 0" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
