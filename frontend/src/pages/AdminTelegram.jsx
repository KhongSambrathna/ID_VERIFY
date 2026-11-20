import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";
import { formatUSD, approxKHR } from "../utils/currency";

// 🤖 Telegram bot — the shop bot customers order from, and the Admin's own
// private alerts (orders, stock, debts, owed to me, daily summary).
const TZ = "Asia/Phnom_Penh";
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default function AdminTelegram() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "orders" ? "orders" : "setup";
  const setTab = (k) => setParams(k === "setup" ? {} : { tab: k }, { replace: true });
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
        <button className={`tab-btn ${tab === "setup" ? "active" : ""}`} onClick={() => setTab("setup")}>⚙️ {t("tgBot.tabSetup")}</button>
        <button className={`tab-btn ${tab === "orders" ? "active" : ""}`} onClick={() => setTab("orders")}>
          🛒 {t("tgBot.tabOrders")}
          {st && st.pendingOrders > 0 && <span className="tg-count">{st.pendingOrders}</span>}
        </button>
      </div>
      {st === null && <p>{t("common.loading")}</p>}
      {st === false && <p className="error-text">{t("tgBot.loadFailed")}</p>}
      {st && tab === "setup" && <Setup st={st} reload={loadStatus} setSt={setSt} />}
      {st && tab === "orders" && <Orders onChange={loadStatus} />}
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

function Setup({ st, reload, setSt }) {
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
  const setAlert = async (k, v) => {
    setSt((s) => ({ ...s, alerts: { ...s.alerts, [k]: v } }));
    await api.put("/telegram/alerts", { [k]: v }).catch(() => {});
  };
  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => setMsg(`📋 ${t("tgBot.copied")}`)).catch(() => {});
  };

  const botUrl = st.bot ? `https://t.me/${st.bot.username}` : "";
  const shopLink = st.bot ? `https://t.me/${st.bot.username}?start=shop` : "";
  const ALERTS = [
    ["orders", "🛒", t("tgBot.alertOrders"), t("tgBot.alertOrdersHelp")],
    ["stock", "📦", t("tgBot.alertStock"), t("tgBot.alertStockHelp")],
    ["debts", "💳", t("tgBot.alertDebts"), t("tgBot.alertDebtsHelp")],
    ["owed", "🤝", t("tgBot.alertOwed"), t("tgBot.alertOwedHelp")],
    ["daily", "📊", t("tgBot.alertDaily"), t("tgBot.alertDailyHelp")],
  ];

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
            <small className="mini-empty">{t("tgBot.shareHelp")}</small>
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

      <Step n={4} done={st.linked && Object.entries(st.alerts || {}).some(([k, v]) => k !== "dailyHour" && v)} title={t("tgBot.step4")}>
        <p className="tg-private">🔒 {t("tgBot.privateNote")}</p>
        <div className="tg-alerts">
          {ALERTS.map(([k, icon, label, help]) => (
            <label key={k} className={`tg-alert ${st.alerts?.[k] ? "on" : ""}`}>
              <input type="checkbox" checked={!!st.alerts?.[k]} disabled={!st.linked} onChange={(e) => setAlert(k, e.target.checked)} />
              <span>
                <b>{icon} {label}</b>
                <small>{help}</small>
                {k === "daily" && st.alerts?.daily && (
                  <span className="tg-hour" onClick={(e) => e.preventDefault()}>
                    {t("tgBot.sendAt")}{" "}
                    <select value={st.alerts.dailyHour ?? 20} onChange={(e) => setAlert("dailyHour", Number(e.target.value))}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                      ))}
                    </select>
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {!st.linked && <p className="mini-empty">{t("tgBot.linkFirst")}</p>}
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

const STATUS = {
  pending: ["⏳", "pending"],
  confirmed: ["✅", "verified"],
  rejected: ["❌", "rejected"],
  cancelled: ["🚫", "rejected"],
};

function Orders({ onChange }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/telegram/orders${status ? `?status=${status}` : ""}`);
      setList(data);
    } catch {
      setList([]);
    }
  };
  useEffect(() => {
    setList(null);
    load();
  }, [status]);

  const act = async (o, what) => {
    if (what === "reject" && !confirm(t("tgBot.confirmReject").replace("{n}", o.orderNo))) return;
    setBusy(o._id);
    try {
      await api.post(`/telegram/orders/${o._id}/${what}`);
      await load();
      onChange();
    } catch (e) {
      alert(e.response?.data?.message || t("tgBot.failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="tg-filter">
        {[["pending", `⏳ ${t("tgBot.stPending")}`], ["confirmed", `✅ ${t("tgBot.stConfirmed")}`], ["rejected", `❌ ${t("tgBot.stRejected")}`], ["", t("tgBot.all")]].map(([k, label]) => (
          <button key={k || "all"} className={`chip ${status === k ? "active" : ""}`} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>
      {list === null && <p>{t("common.loading")}</p>}
      {list && list.length === 0 && <p className="mini-empty">{t("tgBot.noOrders")}</p>}
      <div className="package-grid">
        {(list || []).map((o) => (
          <div key={o._id} className={`card tg-order ${o.status}`}>
            <div className="package-card-head">
              <h3>{o.orderNo}</h3>
              <div className="package-price">
                {formatUSD(o.total)}
                <small className="price-khr">{approxKHR(o.total)}</small>
              </div>
            </div>
            <div className="tg-order-meta">
              <span className={`badge ${STATUS[o.status][1]}`}>{STATUS[o.status][0]} {t(`tgBot.st_${o.status}`)}</span>
              <span className="mini-empty">{fmtDateTime(o.createdAt)}</span>
            </div>
            <div className="tg-order-cust">
              👤 <b>{o.customer?.name || "—"}</b>
              {o.username && (
                <> · <a href={`https://t.me/${o.username}`} target="_blank" rel="noreferrer">@{o.username}</a></>
              )}
              {o.customer?.phone && (
                <div>📱 <a href={`tel:${o.customer.phone.replace(/\s/g, "")}`}>{o.customer.phone}</a></div>
              )}
              {o.note && <div>📝 {o.note}</div>}
            </div>
            <ul className="package-items">
              {o.items.map((i, n) => (
                <li key={n}>
                  <span>{i.name} × {i.qty}</span>
                  <span>{formatUSD(i.qty * i.unitPrice)}</span>
                </li>
              ))}
            </ul>
            {o.status === "pending" ? (
              <div className="package-actions">
                <button className="btn btn-primary" disabled={busy === o._id} onClick={() => act(o, "confirm")}>✅ {t("tgBot.confirm")}</button>
                <button className="btn btn-outline" disabled={busy === o._id} onClick={() => act(o, "reject")}>❌ {t("tgBot.reject")}</button>
              </div>
            ) : (
              o.invoice && (
                <p style={{ margin: "8px 0 0" }}>
                  🧾 <Link to={`/admin/invoices/${o.invoice._id}`}>{o.invoice.invoiceNo}</Link>
                  {o.invoice.paidAmount < o.invoice.total && <span className="mini-empty"> · {t("tgBot.unpaid")}</span>}
                </p>
              )
            )}
          </div>
        ))}
      </div>
      <p className="mini-empty" style={{ marginTop: 14 }}>{t("tgBot.confirmHelp")}</p>
    </>
  );
}
