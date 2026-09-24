import { useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

// One place for anything a signed-in account (Admin, Head Coach, Player, or
// Referee) manages for THEMSELVES — their own password and their own
// Telegram chat id (used for Telegram notifications and the self-service
// "forgot password" flow on the sign-in page). Both used to be scattered:
// changing your own password had no normal nav link anywhere (only reached
// via the forced first-login redirect), and "My Telegram" was an identical
// card copy-pasted onto AdminDashboard, CoachDashboard, and TournamentsPage.
// This is the one place for all of it, for every role, linked from the navbar.
export default function SettingsPage() {
  const { t } = useLanguage();
  const { user, login } = useAuth();

  // --- My Telegram chat id ---
  const [telegramDraft, setTelegramDraft] = useState(user?.telegramChatId || "");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);

  const saveTelegram = async () => {
    setSavingTelegram(true);
    setTelegramSaved(false);
    try {
      const { data } = await api.put("/auth/me/telegram", { telegramChatId: telegramDraft });
      login(localStorage.getItem("token"), data);
      setTelegramSaved(true);
    } catch (err) {
      alert(err.response?.data?.message || t("common.failedToSave"));
    } finally {
      setSavingTelegram(false);
    }
  };

  // --- Change password ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const savePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError(t("settingsPage.passwordMismatch"));
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError(t("settingsPage.passwordTooShort"));
      return;
    }
    setSavingPassword(true);
    try {
      const { data } = await api.post("/auth/change-password", { currentPassword, newPassword });
      login(data.token, data.admin);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err.response?.data?.message || t("settingsPage.changeFailed"));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>{t("settingsPage.title")}</h2>
      </div>

      <div className="card" style={{ maxWidth: 420, marginBottom: 24 }}>
        <h4 style={{ marginTop: 0 }}>{t("settingsPage.myTelegramCardTitle")}</h4>
        <p className="help-text" style={{ marginTop: -6 }}>
          {t("settingsPage.myTelegramHelp")}
        </p>
        <div className="field">
          <label>{t("settingsPage.myTelegramLabel")}</label>
          <input
            placeholder={t("settingsPage.myTelegramPlaceholder")}
            value={telegramDraft}
            onChange={(e) => {
              setTelegramDraft(e.target.value);
              setTelegramSaved(false);
            }}
          />
        </div>
        <button
          className="btn btn-outline"
          style={{ color: "var(--navy)", borderColor: "var(--navy)" }}
          onClick={saveTelegram}
          disabled={savingTelegram}
        >
          {savingTelegram
            ? t("settingsPage.savingTelegram")
            : telegramSaved
            ? t("settingsPage.telegramSaved")
            : t("common.save")}
        </button>
      </div>

      <form className="card" style={{ maxWidth: 420 }} onSubmit={savePassword}>
        <h4 style={{ marginTop: 0 }}>{t("settingsPage.changePasswordCardTitle")}</h4>
        <div className="field">
          <label>{t("settingsPage.currentPasswordLabel")}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>{t("settingsPage.newPasswordLabel")}</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>{t("settingsPage.confirmNewPasswordLabel")}</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        {passwordError && <div className="error-text">{passwordError}</div>}
        <button className="btn btn-primary" disabled={savingPassword}>
          {savingPassword
            ? t("common.saving")
            : passwordSaved
            ? t("settingsPage.passwordSaved")
            : t("settingsPage.saveNewPassword")}
        </button>
      </form>
    </div>
  );
}
