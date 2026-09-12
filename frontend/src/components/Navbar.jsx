import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { isAuthed, isAdmin, isHeadCoach, isPlayer, logout } = useAuth();
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
          <Link to="/about" onClick={closeMenu}>About</Link>
          <Link to="/search" onClick={closeMenu}>Find a player</Link>
          <Link to="/shop" onClick={closeMenu}>Shop</Link>
          {isAuthed ? (
            <>
              <Link to={isAdmin ? "/admin" : isHeadCoach ? "/coach" : "/player"} onClick={closeMenu}>
                Dashboard
              </Link>
              {!isPlayer && (
                <Link to="/debt-report" onClick={closeMenu}>Debt report</Link>
              )}
              {isAdmin && <Link to="/admin/users" onClick={closeMenu}>Users</Link>}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  closeMenu();
                  logout();
                  navigate("/");
                }}
              >
                Log out
              </a>
            </>
          ) : (
            <Link to="/login" onClick={closeMenu}>Admin login</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
