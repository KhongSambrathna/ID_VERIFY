import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../api/axios";
import { useLanguage } from "../i18n/LanguageContext";

// 💬 in the top bar — opens /chat; the badge = chats with something new.
export default function ChatNavButton() {
  const { t } = useLanguage();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const load = () => !document.hidden && api.get("/chat/unread").then(({ data }) => setUnread(data.unread || 0)).catch(() => {});
    load();
    const id = setInterval(load, location.pathname === "/chat" ? 15000 : 45000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [location.pathname]);
  return (
    <Link to="/chat" className={`nav-bell nav-chat ${location.pathname === "/chat" ? "open" : ""}`} aria-label={t("navbar.chat")} title={t("navbar.chat")}>
      <span className="nav-bell-btn">
        <span aria-hidden="true">💬</span>
        {unread > 0 && <span className="nav-bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </span>
    </Link>
  );
}
