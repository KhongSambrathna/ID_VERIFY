import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

const SHOP_URL = (import.meta.env.VITE_SHOP_URL || "https://shop.brathna.com").replace(/\/$/, "");

// 🤖 ID Telegram bot — players, coaches and Admins link their account here to
// get the site's notices (fees owed, approvals…) and reset a forgotten password.
// The shop has its own bot now (shop.brathna.com → Telegram).

export default function AdminTelegram() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  // KHQR settings and bot orders live on the shop site now
  if (params.get("tab") === "khqr") window.location.replace(`${SHOP_URL}/admin/telegram?tab=khqr`);
  if (params.get("tab") === "orders") window.location.replace(`${SHOP_URL}/admin/telegram?tab=orders`);
  const [st, setSt] = useState(null);

  const loadStatus = async () => {
    try {
      const { data } = await api.get("/telegram/status");
      setSt(data);
      return data;
    } catch {
      setSt(false);
      return null;
    }
  };
  useEffect(() => {
    loadStatus();
  }, []);

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>🤖 {t("tgBot.title")}</h2>
        <p>{t("tgBot.intro")}</p>
      </div>
      <div className="tabs">
        <span className="tab-btn active">⚙️ {t("tgBot.tabSetup")}</span>
        <a className="tab-btn" href={`${SHOP_URL}/admin/telegram`}>🛒 {t("tgBot.tabOrders")} · KHQR ↗</a>
      </div>
      {st === null && <p>{t("common.loading")}</p>}
      {st === false && <p className="error-text">{t("tgBot.loadFailed")}</p>}
      {st && <Setup st={st} reload={loadStatus} />}
    </div>
  );
}

function Step({ n, done, title, children }) {
  return (
    <div className={`card tg-step ${done ? "done" : ""}`}>
      <div className="tg-step-head">
        <span className="tg-step-n">{done ? "✓" : n}</span>
        <h3>{title}</h3>
      </div>
      <div className="tg-step-body">{children}</div>
    </div>
  );
}

function Setup({ st, reload }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [waiting, setWaiting] = useState(false);
  const poll = useRef(null);
  useEffect(() => () => clearInterval(poll.current), []);

  const run = async (key, fn) => {
    setBusy(key);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg(`⚠️ ${e.response?.data?.message || t("tgBot.failed")}`);
    } finally {
      setBusy("");
    }
  };
  const connect = () => run("setup", async () => {
    await api.post("/telegram/setup");
    await reload();
    setMsg(`✅ ${t("tgBot.connectedOk")}`);
  });
  const linkMe = () => run("link", async () => {
    // Open the tab first (popup blockers), then point it at the bot link.
    const w = window.open("", "_blank");
    const { data } = await api.post("/telegram/link");
    if (w) w.location.href = data.url;
    else window.location.href = data.url;
    setWaiting(true);
    clearInterval(poll.current);
    let tries = 0;
    poll.current = setInterval(async () => {
      tries += 1;
      const s = await reload();
      if ((s && s.linked) || tries > 60) {
        clearInterval(poll.current);
        setWaiting(false);
      }
    }, 3000);
  });
  const unlink = () => run("unlink", async () => {
    if (!confirm(t("tgBot.confirmUnlink"))) return;
    await api.delete("/telegram/link");
    await reload();
  });
  const test = () => run("test", async () => {
    await api.post("/telegram/test");
    setMsg(`✅ ${t("tgBot.testSent")}`);
  });
  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => setMsg(`📋 ${t("tgBot.copied")}`)).catch(() => {});
  };

  const botUrl = st.bot ? `https://t.me/${st.bot.username}` : "";
  const shopLink = botUrl; // the bot's address — players open it and press Start

  return (
    <div className="tg-setup">
      {msg && <div className="tg-msg">{msg}</div>}

      <Step n={1} done={st.tokenSet && !!st.bot} title={t("tgBot.step1")}>
        {st.tokenSet && st.bot ? (
          <p>
            ✅ <b>{st.bot.name}</b> ·{" "}
            <a href={botUrl} target="_blank" rel="noreferrer">@{st.bot.username}</a>
          </p>
        ) : (
          <>
            <p className="error-text">{st.tokenSet ? t("tgBot.tokenBad") : t("tgBot.noToken")}</p>
            <ol className="tg-howto">
              <li>{t("tgBot.howto1")}</li>
              <li>{t("tgBot.howto2")}</li>
              <li>{t("tgBot.howto3")}</li>
            </ol>
          </>
        )}
      </Step>

      <Step n={2} done={st.webhook.connected} title={t("tgBot.step2")}>
        {st.webhook.connected ? (
          <p>✅ {t("tgBot.webhookOn")}</p>
        ) : (
          <p className="mini-empty">{t("tgBot.webhookOff")}</p>
        )}
        {st.webhook.lastError && <p className="error-text">⚠️ {st.webhook.lastError}</p>}
        <button className={`btn ${st.webhook.connected ? "btn-outline" : "btn-primary"}`} disabled={!st.tokenSet || busy === "setup"} onClick={connect}>
          🔌 {st.webhook.connected ? t("tgBot.reconnect") : t("tgBot.connect")}
        </button>
        {st.webhook.connected && st.bot && (
          <div className="tg-share">
            <label>{t("tgBot.shareLink")}</label>
            <div className="tg-share-row">
              <code>{shopLink}</code>
              <button className="btn btn-outline" onClick={() => copy(shopLink)}>📋 {t("tgBot.copy")}</button>
              <a className="btn btn-outline" href={shopLink} target="_blank" rel="noreferrer">↗ {t("tgBot.open")}</a>
            </div>
          </div>
        )}
      </Step>

      <Step n={3} done={st.linked} title={t("tgBot.step3")}>
        {st.linked ? (
          <>
            <p>✅ {t("tgBot.linkedAs")} <code>{st.chatId}</code></p>
            <div className="tg-actions">
              <button className="btn btn-outline" disabled={busy === "test"} onClick={test}>🔔 {t("tgBot.sendTest")}</button>
              <button className="link-btn" disabled={busy === "unlink"} onClick={unlink}>{t("tgBot.unlink")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="mini-empty">{t("tgBot.linkHelp")}</p>
            <button className="btn btn-primary" disabled={!st.bot || busy === "link"} onClick={linkMe}>📲 {t("tgBot.linkMe")}</button>
            {waiting && <p className="mini-empty">⏳ {t("tgBot.waitingLink")}</p>}
          </>
        )}
      </Step>

      {st.tickUrl && (
        <details className="card tg-awake">
          <summary>⏰ {t("tgBot.awakeTitle")}</summary>
          <p className="mini-empty">{t("tgBot.awakeHelp")}</p>
          <div className="tg-share-row">
            <code>{st.tickUrl}</code>
            <button className="btn btn-outline" onClick={() => copy(st.tickUrl)}>📋 {t("tgBot.copy")}</button>
          </div>
        </details>
      )}
    </div>
  );
}
