import { useAuth } from "../context/AuthContext";
import SquadListManager from "../components/SquadListManager";

// Read-only view of your own team's squad lists (match-day rosters) — the
// same lists a Head Coach/Admin manages under My Team > Squad list, and the
// same ones tournament registrations get auto-added into. A Player can see
// who's in each list and export it as an image/PDF, but never create, edit,
// or delete one.
export default function PlayerSquadListPage() {
  const { team } = useAuth();

  if (!team) {
    return (
      <div className="container dash-body">
        <p className="error-text">No team is set on your account — ask your Admin/Head Coach to check it.</p>
      </div>
    );
  }

  return (
    <div className="container dash-body">
      <div className="dash-header">
        <h2>Squad lists</h2>
        <p>Match-day squad lists for {team}. You can view and export these, but only your coach can create or edit them.</p>
      </div>
      <SquadListManager team={team} athletes={[]} readOnly />
    </div>
  );
}
