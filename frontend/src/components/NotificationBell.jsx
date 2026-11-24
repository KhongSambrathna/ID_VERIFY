import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// 🔔 in the top bar — the same notices the Telegram bot sends (new
// registrations, removal requests, payments, orders…), for every signed-in
// account, Telegram linked or not. Some notices carry ✅ / ❌ buttons so a
// request (e.g. a coach asking to remove a player) is handled right here.
const POLL_MS = 60 * 1000;

function timeAgo(date, t) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return t("notifications.justNow");
  if (s < 3600) return t("notifications.minAgo").replace("{n}", Math.floor(s / 60));
  if (s < 86400) return t("notifications.hourAgo").replace("{n}", Math.floor(s / 3600));
  if (s < 7 * 86400) return t("notifications.dayAgo").replace("{n}", Math.floor(s / 86400));
  return new Date(date).toLocaleDateString();
}

export default function NotificationBell() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(""); // id of the notice being acted on
  const [rejecting, setRejecting] = useState(null); // { id, reason }
  const [error, setError] = useState("");
  const ref = useRef(null);

  const loadCount = useCallback(() => {
    if (document.hidden) return;
    api
      .get("/notifications/count")
      .then(({ data }) => setUnread(data.unread || 0))
      .catch(() => {});
  }, []);
  const loadList = useCallback(() => {
    api
      .get("/notifications", { params: { limit: 40 } })
      .then(({ data }) => {
        setItems(data.items || []);
        setUnread(data.unread || 0);
      })
      .catch(() => setItems((v) => v || []));
  }, []);

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, POLL_MS);
    const onFocus = () => loadCount();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadCount]);

  // "(3) Countryside…" in the browser tab while something is unread.
  useEffect(() => {
    const clean = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${clean}` : clean;
  }, [unread, location.pathname]);

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    loadList();
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open, loadList]);

  const replace = (item) => setItems((list) => (list || []).map((x) => (x._id === item._id ? { ...x, ...item } : x)));

  const openItem = (n) => {
    if (!n.readAt) {
      api.post(`/notifications/${n._id}/read`).catch(() => {});
      replace({ ...n, readAt: new Date().toISOString() });
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const act = async (n, choice, reason = "") => {
    setBusy(n._id);
    setError("");
    try {
      const { data } = await api.post(`/notifications/${n._id}/act`, { choice, reason });
      if (data.item) replace(data.item);
      setRejecting(null);
      loadList();
    } catch (err) {
      const item = err.response?.data?.item;
      if (item) replace(item);
      setError(err.response?.status === 409 ? t("notifications.alreadyHandled") : err.response?.data?.message || t("notifications.failed"));
      loadList();
    } finally {
      setBusy("");
    }
  };

  const readAll = () => {
    api.post("/notifications/read-all").catch(() => {});
    setItems((list) => (list || []).map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
  };
  const clearAll = () => {
    if (!window.confirm(t("notifications.clearConfirm"))) return;
    api.delete("/notifications").catch(() => {});
    setItems([]);
    setUnread(0);
  };

  const resolvedText = (r) => {
    const who = r.by?.displayName || r.by?.username || "";
    if (r.choice === "approve") return `✅ ${t("notifications.approved")}${who ? ` · ${who}` : ""}`;
    if (r.choice === "reject") return `❌ ${t("notifications.rejected")}${who ? ` · ${who}` : ""}`;
    return `☑️ ${t("notifications.alreadyHandled")}`;
  };

  return (
    <div className={`nav-bell ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className="nav-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("notifications.title")}
        aria-expanded={open}
        title={t("notifications.title")}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="nav-bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="nav-bell-panel" role="dialog" aria-label={t("notifications.title")}>
          <div className="nav-bell-head">
            <strong>🔔 {t("notifications.title")}</strong>
            <div className="nav-bell-head-actions">
              {unread > 0 && (
                <button type="button" className="link-btn" onClick={readAll}>
                  {t("notifications.readAll")}
                </button>
              )}
              {items?.length > 0 && (
                <button type="button" className="link-btn muted" onClick={clearAll}>
                  {t("notifications.clear")}
                </button>
              )}
            </div>
          </div>
          {error && <div className="nav-bell-error">{error}</div>}

          <div className="nav-bell-list">
            {items === null && <div className="nav-bell-empty">{t("notifications.loading")}</div>}
            {items?.length === 0 && <div className="nav-bell-empty">{t("notifications.empty")}</div>}
            {items?.map((n) => {
              const [head, ...rest] = String(n.text).split("\n");
              const pending = n.action?.type && !n.resolved?.choice;
              return (
                <div key={n._id} className={`nav-bell-item ${n.readAt ? "" : "unread"}`}>
                  <button type="button" className="nav-bell-item-main" onClick={() => openItem(n)}>
                    <span className="nav-bell-text">
                      <span className="nav-bell-headline">{head}</span>
                      {rest.filter(Boolean).length > 0 && <span className="nav-bell-body">{rest.filter(Boolean).join(" · ")}</span>}
                    </span>
                    <span className="nav-bell-time">{timeAgo(n.createdAt, t)}</span>
                  </button>

                  {pending && rejecting?.id !== n._id && (
                    <div className="nav-bell-actions">
                      <button type="button" className="nb-btn nb-ok" disabled={busy === n._id} onClick={() => act(n, "approve")}>
                        ✅ {t("notifications.approve")}
                      </button>
                      <button
                        type="button"
                        className="nb-btn nb-no"
                        disabled={busy === n._id}
                        onClick={() => setRejecting({ id: n._id, reason: "" })}
                      >
                        ❌ {t("notifications.reject")}
                      </button>
                    </div>
                  )}
                  {pending && rejecting?.id === n._id && (
                    <div className="nav-bell-reject">
                      <input
                        type="text"
                        value={rejecting.reason}
                        placeholder={t("notifications.reasonPh")}
                        onChange={(e) => setRejecting({ id: n._id, reason: e.target.value })}
                        autoFocus
                      />
                      <div className="nav-bell-actions">
                        <button type="button" className="nb-btn nb-no" disabled={busy === n._id} onClick={() => act(n, "reject", rejecting.reason)}>
                          {t("notifications.confirmReject")}
                        </button>
                        <button type="button" className="nb-btn" onClick={() => setRejecting(null)}>
                          {t("notifications.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                  {n.action?.type && n.resolved?.choice && <div className="nav-bell-done">{resolvedText(n.resolved)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
