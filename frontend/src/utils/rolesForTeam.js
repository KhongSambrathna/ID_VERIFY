// A person can hold more than one role, and belong to more than one team.
// `athlete` here can be either the flattened team-scoped roster shape (a
// plain `.role` string, already just this team's) or a raw/populated
// Athlete document (an `.assignments` array covering every team they're
// on) — a saved Lineup/Formation/StartingXI's populated `athleteId` is the
// latter. Either way, this returns the role(s) that apply to THIS team,
// comma-joined if the person holds more than one role on it.
export function rolesForTeam(athlete, team) {
  if (!athlete) return "";
  if (!athlete.assignments) return athlete.role || "";
  return athlete.assignments
    .filter((a) => a.team === team)
    .map((a) => a.role)
    .join(", ");
}

// True if this person has a PLAYER assignment on the given team — the
// gate used to decide who can be placed on a Formation pitch or picked as
// a Starting XI starter (coaches/medics/etc. are excluded).
export function isPlayerOnTeam(athlete, team) {
  if (!athlete) return false;
  if (!athlete.assignments) return (athlete.role || "PLAYER") === "PLAYER";
  return athlete.assignments.some((a) => a.team === team && a.role === "PLAYER");
}

// Shirt/kit number ON THIS TEAM — same dual-shape handling as rolesForTeam
// (a flattened roster row already carries `.jerseyNumber` directly; a
// raw/populated Athlete doc needs the matching team's assignment picked
// out of `.assignments`). Returns null when none is set.
export function jerseyNumberForTeam(athlete, team) {
  if (!athlete) return null;
  if (!athlete.assignments) return athlete.jerseyNumber ?? null;
  const match = athlete.assignments.find((a) => a.team === team);
  return match?.jerseyNumber ?? null;
}
