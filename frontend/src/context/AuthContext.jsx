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
  // Coach mode — an Admin working as the Head Coach of this team (see
  // backend/middleware/auth.js). Kept in localStorage so a refresh keeps it;
  // api/axios.js sends it as the X-Coach-Team header.
  const [coachTeam, setCoachTeam] = useState(() => {
    try {
      return localStorage.getItem("coachTeam") || null;
    } catch {
      return null;
    }
  });
  const enterCoachMode = (team) => {
    try {
      localStorage.setItem("coachTeam", team);
    } catch {
      /* ignore */
    }
    setCoachTeam(team);
  };
  const exitCoachMode = () => {
    try {
      localStorage.removeItem("coachTeam");
    } catch {
      /* ignore */
    }
    setCoachTeam(null);
  };

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
    localStorage.removeItem("coachTeam");
    setToken(null);
    setUser(null);
    setCoachTeam(null);
  };

  const realRole = user?.role || "ADMIN"; // accounts created before roles existed default to ADMIN
  const inCoachMode = realRole === "ADMIN" && !!coachTeam;
  // Everywhere in the app an Admin in coach mode IS a Head Coach of that team.
  const role = inCoachMode ? "HEAD_COACH" : realRole;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        team: inCoachMode ? coachTeam : user?.team || null,
        realRole,
        isRealAdmin: realRole === "ADMIN",
        coachTeam: inCoachMode ? coachTeam : null,
        inCoachMode,
        enterCoachMode,
        exitCoachMode,
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
