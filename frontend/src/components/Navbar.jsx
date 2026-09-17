import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

// A small click-to-open dropdown menu for grouping related nav links
// together (e.g. "Reports", "Manage") — click-based rather than hover-based
// so it also works on touch, and the same component/markup works for both
// the desktop floating-panel look and the mobile stacked-panel look (CSS
// alone switches between them, see .nav-group in index.css).
function NavDropdown({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
    <div className={`nav-group ${open ? "open" : ""}`} ref={ref}>
      <button type="button" className="nav-group-btn" onClick={() => setOpen((v) => !v)}>
        {label} <span className="nav-caret">▾</span>
      </button>
      <div className="nav-group-menu" onClick={() => setOpen(false)}>
        {children}
      </div>
    </div>
  );
}

export default function Navbar() {
  const { isAuthed, isAdmin, isHeadCoach, isPlayer, athleteId, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);

  // Close the mobile dropdown whenever the route changes, e.g. right after
  // tapping one of its own links — otherwise it stays open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close it on an outside tap/click too, same as any normal dropdown.
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

  return (
    <header className="navbar" ref={navRef}>
      <div className="container">
        <Link to="/" className="brand" onClick={closeMenu}>
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
          <Link to="/about" onClick={closeMenu}>{t("navbar.about")}</Link>
          <Link to="/search" onClick={closeMenu}>{t("navbar.findPlayer")}</Link>
          <Link to="/shop" onClick={closeMenu}>{t("navbar.shop")}</Link>
          <Link to="/pricing" onClick={closeMenu}>{t("navbar.pricing")}</Link>

          {isAuthed && (
            <Link to={isAdmin ? "/admin" : isHeadCoach ? "/coach" : "/player"} onClick={closeMenu}>
              {t("navbar.dashboard")}
            </Link>
          )}

          {isAuthed && !isPlayer && (
            <NavDropdown label={t("navbar.reports")}>
              <Link to="/debt-report" onClick={closeMenu}>{t("navbar.debtReport")}</Link>
              <Link to="/admin/stats" onClick={closeMenu}>{t("navbar.stats")}</Link>
            </NavDropdown>
          )}

          {isAuthed && !isPlayer && (
            <NavDropdown label={t("navbar.manage")}>
              <Link to="/admin/renew" onClick={closeMenu}>{t("navbar.idRenewal")}</Link>
              <Link to="/admin/tournaments" onClick={closeMenu}>{t("navbar.tournaments")}</Link>
              {isAdmin && <Link to="/admin/users" onClick={closeMenu}>{t("navbar.users")}</Link>}
              {isAdmin && <Link to="/admin/subscriptions" onClick={closeMenu}>{t("navbar.subscriptions")}</Link>}
            </NavDropdown>
          )}

          {isAuthed && isPlayer && athleteId && (
            <Link to="/tournaments" onClick={closeMenu}>{t("navbar.tournaments")}</Link>
          )}
          {isAuthed && isPlayer && (
            <Link to="/squad-list" onClick={closeMenu}>{t("navbar.squadList")}</Link>
          )}

          <button type="button" className="lang-switch" onClick={toggleLanguage}>
            {language === "km" ? "EN" : "ខ្មែរ"}
          </button>

          {isAuthed ? (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                closeMenu();
                logout();
                navigate("/");
              }}
            >
              {t("navbar.logout")}
            </a>
          ) : (
            <Link to="/login" onClick={closeMenu}>{t("navbar.adminLogin")}</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
