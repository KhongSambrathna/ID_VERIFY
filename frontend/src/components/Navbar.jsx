import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { isAuthed, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <div className="container">
        <Link to="/" className="brand">
          Countryside <span>Football ID Verify</span>
        </Link>
        <nav>
          {isAuthed ? (
            <>
              <Link to={isAdmin ? "/admin" : "/coach"}>Dashboard</Link>
              {isAdmin && <Link to="/admin/users">Users</Link>}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  logout();
                  navigate("/");
                }}
              >
                Log out
              </a>
            </>
          ) : (
            <Link to="/login">Admin login</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
