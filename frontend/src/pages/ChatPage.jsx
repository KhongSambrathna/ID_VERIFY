import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios";
import Avatar from "../components/Avatar";
import { useLanguage } from "../i18n/LanguageContext";

// 💬 Chat. Same team → chat right away. Another team → add as a friend
// first (they accept). Admins can chat with anyone.
const THREAD_POLL = 4000;
const LIST_POLL = 15000;

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ChatPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "people" || params.get("tab") === "requests" ? "people" : "chats");
  const [convs, setConvs] = useState(null);
  const [people, setPeople] = useState(null);
  const [meInfo, setMeInfo] = useState(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null); // { _id, other, canSend }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const loadConvs = useCallback(() => {
    api
      .get("/chat/conversations")
      .then(({ data }) => setConvs(data.items || []))
      .catch(() => setConvs((v) => v || []));
  }, []);
  const loadPeople = useCallback((query = "") => {
    api
      .get("/chat/people", { params: query ? { q: query } : {} })
      .then(({ data }) => {
        setPeople(data.people || []);
        setMeInfo(data.me);
      })
      .catch(() => setPeople((v) => v || []));
  }, []);

  useEffect(() => {
    loadConvs();
    loadPeople();
    const id = setInterval(() => !document.hidden && loadConvs(), LIST_POLL);
    return () => clearInterval(id);
  }, [loadConvs, loadPeople]);

  // Search (debounced).
  useEffect(() => {
    const id = setTimeout(() => loadPeople(q.trim()), q ? 350 : 0);
    return () => clearTimeout(id);
  }, [q, loadPeople]);

  const openWith = useCallback(
    async (userId) => {
      setError("");
      try {
        const { data } = await api.post("/chat/conversations", { userId });
        setActive(data);
        setParams({ with: userId }, { replace: true });
      } catch (err) {
        if (err.response?.data?.code === "NOT_FRIENDS") setError(t("chat.needFriend"));
        else setError(err.response?.data?.message || t("chat.failed"));
      }
    },
    [setParams, t]
  );

  // /chat?with=<userId> (from a notification or a profile link).
  const withParam = params.get("with");
  useEffect(() => {
    if (withParam && active?.other?._id !== withParam) openWith(withParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withParam]);

  const closeThread = () => {
    setActive(null);
    setParams({}, { replace: true });
    loadConvs();
  };

  const friendAction = async (person, what) => {
    setBusy(person._id);
    setError("");
    try {
      if (what === "add") await api.post("/chat/friends", { userId: person._id });
      if (what === "accept") await api.post(`/chat/friends/${person.friendshipId}/accept`);
      if (what === "decline" || what === "cancel") await api.post(`/chat/friends/${person.friendshipId}/decline`);
      if (what === "unfriend") {
        if (!window.confirm(t("chat.unfriendConfirm").replace("{name}", person.name))) return;
        await api.delete(`/chat/friends/${person._id}`);
      }
      loadPeople(q.trim());
      if (active?.other?._id === person._id) openWith(person._id);
    } catch (err) {
      setError(err.response?.data?.message || t("chat.failed"));
    } finally {
      setBusy("");
    }
  };

  const received = (people || []).filter((p) => p.relation === "received");
  const groups = useMemo(() => {
    const list = (people || []).filter((p) => p.relation !== "received");
    const by = (r) => list.filter((p) => r.includes(p.relation));
    return q.trim()
      ? [{ key: "results", items: list }]
      : [
          { key: "admin", items: by(["admin"]) },
          { key: "team", items: by(["team"]) },
          { key: "friend", items: by(["friend"]) },
          { key: "sent", items: by(["sent"]) },
        ];
  }, [people, q]);
  const unreadChats = (convs || []).filter((c) => c.unread > 0).length;

  const relationLabel = (p) =>
    p.relation === "team"
      ? `👥 ${t("chat.sameTeam")}`
      : p.relation === "friend"
      ? `🤝 ${t("chat.friend")}`
      : p.relation === "admin"
      ? `⭐ Admin`
      : p.relation === "sent"
      ? `⏳ ${t("chat.requestSent")}`
      : "";

  const PersonRow = ({ p }) => (
    <div className="chat-person">
      <button type="button" className="chat-person-main" onClick={() => (["admin", "team", "friend"].includes(p.relation) ? openWith(p._id) : null)}>
        <Avatar name={p.name} photoUrl={p.photoUrl} size={40} />
        <span className="chat-person-text">
          <span className="chat-person-name">{p.name}</span>
          <span className="chat-person-sub">
            {[p.khmerName, p.teams.join(", ") || (p.role === "ADMIN" ? "" : p.role), relationLabel(p)].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      <div className="chat-person-actions">
        {["admin", "team", "friend"].includes(p.relation) && (
          <button type="button" className="chat-btn primary" onClick={() => openWith(p._id)}>
            💬
          </button>
        )}
        {p.relation === "none" && (
          <button type="button" className="chat-btn" disabled={busy === p._id} onClick={() => friendAction(p, "add")}>
            ➕ {t("chat.addFriend")}
          </button>
        )}
        {p.relation === "sent" && (
          <button type="button" className="chat-btn muted" disabled={busy === p._id} onClick={() => friendAction(p, "cancel")}>
            {t("chat.cancel")}
          </button>
        )}
        {p.relation === "received" && (
          <>
            <button type="button" className="chat-btn ok" disabled={busy === p._id} onClick={() => friendAction(p, "accept")}>
              ✅ {t("chat.accept")}
            </button>
            <button type="button" className="chat-btn no" disabled={busy === p._id} onClick={() => friendAction(p, "decline")}>
              ❌
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`container chat-page ${active ? "has-thread" : ""}`}>
      <aside className="chat-side">
        <div className="chat-side-head">
          <h1>💬 {t("chat.title")}</h1>
          <div className="chat-tabs">
            <button type="button" className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>
              {t("chat.chats")} {unreadChats > 0 && <span className="chat-count">{unreadChats}</span>}
            </button>
            <button type="button" className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>
              {t("chat.people")} {received.length > 0 && <span className="chat-count">{received.length}</span>}
            </button>
          </div>
        </div>
        {error && !active && <div className="chat-error">{error}</div>}

        {tab === "chats" && (
          <div className="chat-list">
            {convs === null && <div className="chat-empty">{t("chat.loading")}</div>}
            {convs?.length === 0 && (
              <div className="chat-empty">
                {t("chat.noChats")}
                <button type="button" className="chat-btn primary" onClick={() => setTab("people")}>
                  👥 {t("chat.findPeople")}
                </button>
              </div>
            )}
            {convs?.map((c) => (
              <button
                key={c._id}
                type="button"
                className={`chat-conv ${active?._id === c._id ? "active" : ""} ${c.unread ? "unread" : ""}`}
                onClick={() => openWith(c.other._id)}
              >
                <Avatar name={c.other.name} photoUrl={c.other.photoUrl} size={44} />
                <span className="chat-conv-text">
                  <span className="chat-conv-top">
                    <span className="chat-person-name">{c.other.name}</span>
                    <span className="chat-conv-time">{c.last?.at && (sameDay(c.last.at, Date.now()) ? hhmm(c.last.at) : new Date(c.last.at).toLocaleDateString())}</span>
                  </span>
                  <span className="chat-conv-last">
                    {String(c.last?.sender) === meInfo?._id ? `${t("chat.you")}: ` : ""}
                    {c.last?.text || <i>{t("chat.deleted")}</i>}
                  </span>
                </span>
                {c.unread > 0 && <span className="chat-count">{c.unread}</span>}
              </button>
            ))}
          </div>
        )}

        {tab === "people" && (
          <div className="chat-list">
            <input className="chat-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.searchPh")} />
            <div className="chat-hint">{t("chat.rules")}</div>
            {received.length > 0 && (
              <>
                <div className="chat-group-label">👋 {t("chat.requests")}</div>
                {received.map((p) => (
                  <PersonRow key={p._id} p={p} />
                ))}
              </>
            )}
            {people === null && <div className="chat-empty">{t("chat.loading")}</div>}
            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.key}>
                    <div className="chat-group-label">{t(`chat.group.${g.key}`)}</div>
                    {g.items.map((p) => (
                      <PersonRow key={p._id} p={p} />
                    ))}
                  </div>
                )
            )}
            {people?.length === 0 && <div className="chat-empty">{q ? t("chat.noResults") : t("chat.noPeople")}</div>}
          </div>
        )}
      </aside>

      <section className="chat-main">
        {active ? (
          <Thread key={active._id} conv={active} me={meInfo} onBack={closeThread} onChanged={loadConvs} onUnfriend={() => friendAction(active.other, "unfriend")} onAddFriend={() => friendAction(active.other, "add")} />
        ) : (
          <div className="chat-placeholder">
            <div style={{ fontSize: 48 }}>💬</div>
            <p>{t("chat.pick")}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({ conv, me, onBack, onChanged, onUnfriend, onAddFriend }) {
  const { t } = useLanguage();
  const [msgs, setMsgs] = useState(null);
  const [more, setMore] = useState(false);
  const [otherRead, setOtherRead] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  const listRef = useRef(null);
  const atBottom = useRef(true);
  const other = conv.other;

  const scrollDown = () => requestAnimationFrame(() => listRef.current && (listRef.current.scrollTop = listRef.current.scrollHeight));
  const markRead = () => api.post(`/chat/conversations/${conv._id}/read`).then(onChanged).catch(() => {});

  useEffect(() => {
    api.get(`/chat/conversations/${conv._id}/messages`).then(({ data }) => {
      setMsgs(data.items);
      setMore(data.more);
      setOtherRead(data.otherRead);
      scrollDown();
      markRead();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv._id]);

  // New messages every few seconds while open.
  const lastAt = msgs?.length ? msgs[msgs.length - 1].createdAt : null;
  useEffect(() => {
    if (msgs === null) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      api
        .get(`/chat/conversations/${conv._id}/messages`, { params: lastAt ? { after: lastAt } : {} })
        .then(({ data }) => {
          setOtherRead(data.otherRead);
          const fresh = (data.items || []).filter((m) => !msgs.some((x) => x._id === m._id));
          if (fresh.length) {
            setMsgs((list) => [...list, ...fresh.filter((m) => !list.some((x) => x._id === m._id))]);
            if (atBottom.current) scrollDown();
            if (fresh.some((m) => String(m.sender) !== me?._id)) markRead();
          }
        })
        .catch(() => {});
    }, THREAD_POLL);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv._id, lastAt, msgs === null]);

  const loadOlder = () => {
    if (!msgs?.length) return;
    const el = listRef.current;
    const h = el.scrollHeight;
    api.get(`/chat/conversations/${conv._id}/messages`, { params: { before: msgs[0].createdAt } }).then(({ data }) => {
      setMsgs((list) => [...data.items, ...list]);
      setMore(data.more);
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - h));
    });
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr("");
    try {
      const { data } = await api.post(`/chat/conversations/${conv._id}/messages`, { text: body });
      setMsgs((list) => [...(list || []), data]);
      setText("");
      scrollDown();
      onChanged();
    } catch (error) {
      setErr(error.response?.data?.code === "NOT_FRIENDS" ? t("chat.needFriend") : error.response?.data?.message || t("chat.failed"));
    } finally {
      setSending(false);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    await api.delete(`/chat/messages/${m._id}`).catch(() => {});
    setMsgs((list) => list.map((x) => (x._id === m._id ? { ...x, deleted: true, text: "" } : x)));
    onChanged();
  };

  const mine = (m) => String(m.sender) === me?._id;
  const lastMine = [...(msgs || [])].reverse().find(mine);

  return (
    <div className="chat-thread">
      <header className="chat-thread-head">
        <button type="button" className="chat-back" onClick={onBack} aria-label={t("chat.back")}>
          ←
        </button>
        <Avatar name={other.name} photoUrl={other.photoUrl} size={38} />
        <div className="chat-thread-who">
          <div className="chat-person-name">{other.name}</div>
          <div className="chat-person-sub">{[other.teams?.join(", ") || other.role, other.relation === "friend" ? `🤝 ${t("chat.friend")}` : ""].filter(Boolean).join(" · ")}</div>
        </div>
        {other.isFriend && (
          <div className="chat-menu">
            <button type="button" className="chat-btn muted" onClick={() => setMenu((v) => !v)}>
              ⋯
            </button>
            {menu && (
              <div className="chat-menu-pop">
                <button type="button" onClick={() => { setMenu(false); onUnfriend(); }}>
                  {t("chat.unfriend")}
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div
        className="chat-msgs"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {more && (
          <button type="button" className="chat-older" onClick={loadOlder}>
            {t("chat.older")}
          </button>
        )}
        {msgs === null && <div className="chat-empty">{t("chat.loading")}</div>}
        {msgs?.length === 0 && <div className="chat-empty">{t("chat.sayHi").replace("{name}", other.name)}</div>}
        {msgs?.map((m, i) => (
          <div key={m._id}>
            {(i === 0 || !sameDay(msgs[i - 1].createdAt, m.createdAt)) && (
              <div className="chat-day">{new Date(m.createdAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
            )}
            <div className={`chat-msg ${mine(m) ? "mine" : ""} ${m.deleted ? "deleted" : ""}`}>
              <div className="chat-bubble">
                {m.deleted ? <i>{t("chat.deleted")}</i> : m.text}
                <span className="chat-time">{hhmm(m.createdAt)}</span>
              </div>
              {mine(m) && !m.deleted && (
                <button type="button" className="chat-del" onClick={() => remove(m)} aria-label={t("chat.delete")} title={t("chat.delete")}>
                  🗑
                </button>
              )}
            </div>
            {lastMine && m._id === lastMine._id && otherRead && new Date(otherRead) >= new Date(m.createdAt) && (
              <div className="chat-seen">✓✓ {t("chat.seen")}</div>
            )}
          </div>
        ))}
      </div>

      {conv.canSend === false || err === t("chat.needFriend") ? (
        <div className="chat-locked">
          {other.relation === "sent" ? t("chat.waitingAccept") : t("chat.needFriend")}
          {other.relation === "none" && (
            <button type="button" className="chat-btn primary" onClick={onAddFriend}>
              ➕ {t("chat.addFriend")}
            </button>
          )}
        </div>
      ) : (
        <form className="chat-compose" onSubmit={send}>
          <textarea
            rows={1}
            value={text}
            maxLength={2000}
            placeholder={t("chat.typePh")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) send(e);
            }}
          />
          <button type="submit" className="chat-send" disabled={!text.trim() || sending} aria-label={t("chat.send")}>
            ➤
          </button>
        </form>
      )}
      {err && err !== t("chat.needFriend") && <div className="chat-error">{err}</div>}
    </div>
  );
}
