import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(readStoredUser());

  // login(token, adminInfo) — adminInfo is the `admin` object the API
  // returns on login/register: { id, username, role, team }
  const login = (newToken, adminInfo) => {
    localStorage.setItem("token", newToken);
    if (adminInfo) localStorage.setItem("user", JSON.stringify(adminInfo));
    setToken(newToken);
    setUser(adminInfo || null);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  const role = user?.role || "ADMIN"; // accounts created before roles existed default to ADMIN

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        team: user?.team || null,
        // Set only on an individual per-athlete Player login (tournament
        // self-registration) — null for every other account, including the
        // older shared team-wide Player login.
        athleteId: user?.athleteId || null,
        mustChangePassword: !!user?.mustChangePassword,
        isAuthed: !!token,
        isAdmin: role === "ADMIN",
        isHeadCoach: role === "HEAD_COACH",
        isPlayer: role === "PLAYER",
        isReferee: role === "REFEREE",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
