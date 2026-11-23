import { useEffect, useState } from "react";
import QRCode from "qrcode";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// Telegram bot page → "💳 KHQR" tab: where customers' payments go (Bakong
// account ID), the Bakong API token used to verify them, and the group that
// gets "💰 paid" notices.
export default function KhqrSettings() {
  const { t } = useLanguage();
  const [s, setS] = useState(null);
  const [f, setF] = useState(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testImg, setTestImg] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/telegram/pay-settings");
      setS(data);
      setF({
        bakongAccountId: data.bakongAccountId,
        merchantName: data.merchantName,
        merchantCity: data.merchantCity,
        currency: data.currency,
        expiresMinutes: String(data.expiresMinutes),
        autoConfirm: data.autoConfirm,
        tokenEmail: data.tokenEmail,
      });
    } catch {
      setS(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (extra = {}) => {
    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const { data } = await api.put("/telegram/pay-settings", { ...f, expiresMinutes: Number(f.expiresMinutes), ...(token.trim() ? { token: token.trim() } : {}), ...extra });
      setS(data);
      setToken("");
      setMsg(t("khqr.saved"));
    } catch (e) {
      setErr(e.response?.data?.message || t("tgBot.failed"));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    setTestImg("");
    try {
      const { data } = await api.post("/telegram/pay-settings/test");
      setTest(data);
      if (data.qr) setTestImg(await QRCode.toDataURL(data.qr, { width: 240, margin: 1 }));
    } catch (e) {
      setTest({ error: e.response?.data?.message || t("tgBot.failed") });
    } finally {
      setTesting(false);
    }
  };

  if (s === null) return <p>{t("common.loading")}</p>;
  if (s === false) return <p className="error-text">{t("tgBot.loadFailed")}</p>;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="khqr-settings">
      <div className={`card tg-step ${s.enabled ? "done" : ""}`}>
        <div className="tg-step-head">
          <span className="tg-step-n">{s.enabled ? "✓" : "💳"}</span>
          <h3>{t("khqr.title")}</h3>
        </div>
        <p className="help-text">{t("khqr.intro")}</p>
        <label className="check-row" style={{ fontWeight: 700 }}>
          <input type="checkbox" checked={s.enabled} disabled={saving} onChange={(e) => save({ enabled: e.target.checked })} /> {t("khqr.enabled")}
        </label>
      </div>

      <div className="card tg-step">
        <h3 style={{ marginTop: 0 }}>1. {t("khqr.whereTitle")}</h3>
        <div className="field">
          <label>{t("khqr.accountId")} *</label>
          <input value={f.bakongAccountId} onChange={set("bakongAccountId")} placeholder="brathna@aclb" autoCapitalize="none" />
          <small className="mini-empty">{t("khqr.accountIdHelp")}</small>
        </div>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 2, minWidth: 160 }}>
            <label>{t("khqr.merchantName")}</label>
            <input value={f.merchantName} onChange={set("merchantName")} maxLength={25} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label>{t("khqr.city")}</label>
            <input value={f.merchantCity} onChange={set("merchantCity")} maxLength={15} />
          </div>
        </div>
        <div className="filter-row" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label>{t("khqr.currency")}</label>
            <select value={f.currency} onChange={set("currency")}>
              <option value="USD">$ USD</option>
              <option value="KHR">៛ Riel (×4,000)</option>
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 120 }}>
            <label>{t("khqr.expires")}</label>
            <input type="number" min="3" max="1440" value={f.expiresMinutes} onChange={set("expiresMinutes")} />
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={f.autoConfirm} onChange={(e) => setF((p) => ({ ...p, autoConfirm: e.target.checked }))} /> {t("khqr.autoConfirm")}
        </label>
      </div>

      <div className="card tg-step">
        <h3 style={{ marginTop: 0 }}>2. {t("khqr.tokenTitle")}</h3>
        <p className="help-text">{t("khqr.tokenHelp")}</p>
        <p style={{ margin: "4px 0 10px" }}>
          <a href="https://api-bakong.nbc.gov.kh/register" target="_blank" rel="noreferrer">api-bakong.nbc.gov.kh/register ↗</a>
        </p>
        <div className="field">
          <label>
            {t("khqr.token")} {s.tokenSet && <span className="badge verified">{t("khqr.tokenSaved")} {s.tokenHint}</span>}
          </label>
          <textarea rows={2} value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.tokenSet ? t("khqr.tokenReplace") : "eyJhbGciOi…"} />
        </div>
        <div className="field">
          <label>{t("khqr.tokenEmail")}</label>
          <input type="email" value={f.tokenEmail} onChange={set("tokenEmail")} placeholder="you@gmail.com" />
          <small className="mini-empty">{t("khqr.tokenEmailHelp")}</small>
        </div>
        {s.lastCheckError && (
          <p className="error-text">
            ⚠️ {t("khqr.lastError")}: {s.lastCheckError}
          </p>
        )}
      </div>

      <div className="card tg-step">
        <h3 style={{ marginTop: 0 }}>3. {t("khqr.groupTitle")}</h3>
        <p className="help-text">{t("khqr.groupHelp")}</p>
        {s.groupChatId ? (
          <p>
            ✅ <b>{s.groupTitle || s.groupChatId}</b>{" "}
            <button type="button" className="link-btn" onClick={() => save({ clearGroup: true })}>
              {t("khqr.groupRemove")}
            </button>
          </p>
        ) : (
          <p className="mini-empty">{t("khqr.groupNone")}</p>
        )}
        <p className="help-text" style={{ marginBottom: 0 }}>⚠️ {t("khqr.bankBotNote")}</p>
      </div>

      {err && <p className="error-text">{err}</p>}
      {msg && <p className="success-text">✅ {msg}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "6px 0 18px" }}>
        <button className="btn btn-primary" disabled={saving} onClick={() => save()}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
        <button className="btn btn-outline" disabled={testing || !s.bakongAccountId} onClick={runTest}>
          {testing ? t("khqr.testing") : `🧪 ${t("khqr.test")}`}
        </button>
      </div>

      {test && (
        <div className="card tg-step">
          <h3 style={{ marginTop: 0 }}>🧪 {t("khqr.testResult")}</h3>
          <ul className="khqr-test">
            <li>{test.qr ? "✅" : "❌"} {t("khqr.testQr")}</li>
            {test.token !== null && test.token !== undefined && (
              <li>
                {test.token ? "✅" : "❌"} {t("khqr.testToken")}
              </li>
            )}
            {test.token && (
              <li>
                {test.account ? "✅" : "⚠️"} {test.account ? t("khqr.testAccountOk") : t("khqr.testAccountMissing")}
              </li>
            )}
          </ul>
          {test.error && <p className="error-text">{test.error}</p>}
          {testImg && (
            <div style={{ textAlign: "center" }}>
              <img src={testImg} alt="KHQR test" style={{ width: 200, height: 200 }} />
              <p className="mini-empty">{t("khqr.testScan")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
