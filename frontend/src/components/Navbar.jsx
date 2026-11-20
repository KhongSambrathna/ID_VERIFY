import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import InstallAppButton from "./InstallAppButton";

// Is this link the page we're on? A link with "?tab=…" only matches that
// exact tab; a plain link matches its path when no tab is selected — so
// "Manage products" / "Stock in/out" / "Shop report" highlight separately.
function matches(location, to) {
  const [path, query = ""] = to.split("?");
  if (location.pathname !== path) return false;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(location.search);
  if (!query) return !have.get("tab");
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  return true;
}

// A small click-to-open dropdown menu for grouping related nav links —
// click-based rather than hover-based so it also works on touch, and the
// same markup works for both the desktop floating panel and the mobile
// stacked panel (CSS alone switches between them, see .nav-group).
// `active` highlights the group when the current page is one of its links.
function NavDropdown({ label, active, align, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [open]);

  return (
    <div className={`nav-group ${open ? "open" : ""} ${active ? "active" : ""} ${align === "right" ? "align-right" : ""}`} ref={ref}>
      <button type="button" className="nav-group-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label} <span className="nav-caret">▾</span>
      </button>
      <div className="nav-group-menu" onClick={() => setOpen(false)}>
        {children}
      </div>
    </div>
  );
}

export default function Navbar() {
  const { isAuthed, isAdmin, isHeadCoach, isPlayer, isReferee, athleteId, user, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);

  // Close the mobile panel whenever the page changes (e.g. right after
  // tapping one of its links) and on an outside tap.
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  // One nav link — highlighted when it's the current page.
  const L = ({ to, children }) => (
    <Link to={to} onClick={closeMenu} className={matches(location, to) ? "active" : ""}>
      {children}
    </Link>
  );
  const anyActive = (...tos) => tos.some((to) => matches(location, to));
  const Label = ({ children }) => <div className="nav-group-label">{children}</div>;

  const doLogout = (e) => {
    e.preventDefault();
    closeMenu();
    logout();
    navigate("/");
  };

  const dashboardPath = isAdmin ? "/admin" : isHeadCoach ? "/coach" : isReferee ? "/referee" : "/player";

  // "More" — the public pages, tucked away for signed-in users who mostly
  // live in their dashboard.
  const publicLinks = ["/search", "/shop", "/pricing", "/about"];
  const morePublic = () => (
    <NavDropdown label={t("navbar.more")} active={anyActive(...publicLinks)}>
      <L to="/search">🔍 {t("navbar.findPlayer")}</L>
      <L to="/shop">🛒 {t("navbar.shop")}</L>
      <L to="/pricing">💳 {t("navbar.pricing")}</L>
      <L to="/about">ℹ️ {t("navbar.about")}</L>
    </NavDropdown>
  );

  // Account menu — who's signed in, settings, logout. Always last.
  const accountMenu = () => (
    <NavDropdown
      label={<span className="nav-account">👤 {user?.username || t("navbar.account")}</span>}
      active={anyActive("/settings", "/player/edit", "/change-password")}
      align="right"
    >
      {user?.role && <Label>{t(`navbar.role_${user.role}`, user.role)}</Label>}
      {isPlayer && athleteId && <L to="/player/edit">✏️ {t("navbar.editProfile")}</L>}
      <L to="/settings">⚙️ {t("navbar.settings")}</L>
      <a href="#" onClick={doLogout} className="nav-logout">
        ⎋ {t("navbar.logout")}
      </a>
    </NavDropdown>
  );

  return (
    <header className="navbar" ref={navRef}>
      <div className="container">
        <Link to={isAuthed ? dashboardPath : "/"} className="brand" onClick={closeMenu}>
          Countryside <span>Football ID Verify</span>
        </Link>

        <button
          type="button"
          className={`nav-toggle ${open ? "open" : ""}`}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={open ? "open" : ""}>
          {/* ---------- Visitors (not signed in) ---------- */}
          {!isAuthed && (
            <>
              <L to="/search">{t("navbar.findPlayer")}</L>
              <L to="/shop">{t("navbar.shop")}</L>
              <L to="/pricing">{t("navbar.pricing")}</L>
              <L to="/about">{t("navbar.about")}</L>
            </>
          )}

          {/* ---------- Admin ---------- */}
          {isAuthed && isAdmin && (
            <>
              <L to="/admin">{t("navbar.dashboard")}</L>
              <NavDropdown label={t("navbar.athletes")} active={anyActive("/admin/new", "/admin/cards", "/admin/cards/back")}>
                <L to="/admin/new">➕ {t("navbar.addAthlete")}</L>
                <L to="/admin/cards">🪪 {t("navbar.exportCards")}</L>
                <L to="/admin/cards/back">🖨️ {t("navbar.printCardBacks")}</L>
              </NavDropdown>
              <NavDropdown
                label={t("navbar.competitions")}
                active={anyActive("/admin/tournaments", "/admin/matchday", "/admin/jersey-orders")}
              >
                <L to="/admin/tournaments">🏆 {t("navbar.tournaments")}</L>
                <L to="/admin/matchday">⚽ {t("navbar.matchDay")}</L>
                <L to="/admin/jersey-orders">👕 {t("navbar.jerseyOrders")}</L>
              </NavDropdown>
              <NavDropdown
                label={t("navbar.shop")}
                active={
                  anyActive("/admin/shop", "/admin/shop?tab=stock", "/admin/shop?tab=report", "/admin/shop?tab=packages", "/admin/invoices", "/admin/purchase-plans") ||
                  location.pathname.startsWith("/admin/invoices/")
                }
              >
                <L to="/admin/invoices">🧾 {t("navbar.invoices")}</L>
                <L to="/admin/shop">📦 {t("navbar.shopProducts")}</L>
                <L to="/admin/shop?tab=stock">🔄 {t("navbar.shopStock")}</L>
                <L to="/admin/shop?tab=packages">🎁 {t("navbar.packages")}</L>
                <L to="/admin/purchase-plans">🛒 {t("navbar.purchasePlans")}</L>
                <L to="/admin/shop?tab=report">📈 {t("navbar.shopReport")}</L>
                <L to="/shop">🛒 {t("navbar.viewPublicShop")}</L>
              </NavDropdown>
              <NavDropdown label={t("navbar.reports")} active={anyActive("/admin/stats", "/debt-report", "/admin/analytics")}>
                <L to="/admin/stats">📊 {t("navbar.stats")}</L>
                <L to="/debt-report">💰 {t("navbar.debtReport")}</L>
                <L to="/admin/analytics">👥 {t("navbar.analytics")}</L>
              </NavDropdown>
              <NavDropdown
                label={t("navbar.system")}
                active={anyActive("/admin/users", "/admin/sponsors", "/admin/poster", ...publicLinks)}
              >
                <Label>{t("navbar.manage")}</Label>
                <L to="/admin/users">🔑 {t("navbar.users")}</L>
                <L to="/admin/sponsors">🤝 {t("navbar.sponsors")}</L>
                <L to="/admin/poster">🖼️ {t("navbar.posterGenerator")}</L>
                <Label>{t("navbar.publicPages")}</Label>
                <L to="/search">🔍 {t("navbar.findPlayer")}</L>
                <L to="/pricing">💳 {t("navbar.pricing")}</L>
                <L to="/about">ℹ️ {t("navbar.about")}</L>
              </NavDropdown>
            </>
          )}

          {/* ---------- Head coach ---------- */}
          {isAuthed && isHeadCoach && (
            <>
              <L to="/coach">{t("navbar.dashboard")}</L>
              <L to="/coach?tab=attendance">{t("navbar.attendance")}</L>
              <L to="/admin/tournaments">{t("navbar.tournaments")}</L>
              <NavDropdown label={t("navbar.reports")} active={anyActive("/admin/stats", "/debt-report")}>
                <L to="/admin/stats">📊 {t("navbar.stats")}</L>
                <L to="/debt-report">💰 {t("navbar.debtReport")}</L>
              </NavDropdown>
              {morePublic()}
            </>
          )}

          {/* ---------- Player ---------- */}
          {isAuthed && isPlayer && (
            <>
              <L to="/player">{t("navbar.dashboard")}</L>
              {athleteId && <L to="/tournaments">{t("navbar.tournaments")}</L>}
              <L to="/squad-list">{t("navbar.squadList")}</L>
              <L to="/jersey-orders">{t("navbar.jerseyOrders")}</L>
              {morePublic()}
            </>
          )}

          {/* ---------- Referee ---------- */}
          {isAuthed && isReferee && (
            <>
              <L to="/referee">{t("navbar.schedule")}</L>
              {morePublic()}
            </>
          )}

          <span className="nav-spacer" />

          <InstallAppButton onDone={closeMenu} />

          <button type="button" className="lang-switch" onClick={toggleLanguage}>
            {language === "km" ? "EN" : "ខ្មែរ"}
          </button>

          {isAuthed ? (
            accountMenu()
          ) : (
            <Link to="/login" onClick={closeMenu} className="nav-login-btn">
              {t("navbar.login")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
