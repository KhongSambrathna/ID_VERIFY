// Shapes one Athlete document into one row PER team/role assignment — the
// flat {team, role, approvalStatus, ...} shape every list/table/roster
// consumer expects, so a person who belongs to 3 teams simply shows up as
// 3 rows instead of every caller needing to know about the `assignments`
// array. Shared between athleteController (GET /api/athletes) and
// coachRoutes (GET /api/coach/my-team) so both build rosters the same way.
//
// `teamFilter`, when given, keeps only that team's assignment(s).
function flattenAssignments(athlete, teamFilter) {
  const base = {
    _id: athlete._id,
    fullName: athlete.fullName,
    khmerName: athlete.khmerName,
    dateOfBirth: athlete.dateOfBirth,
    gender: athlete.gender,
    address: athlete.address,
    isAvailable: athlete.isAvailable,
    photoUrl: athlete.photoUrl,
    photoPublicId: athlete.photoPublicId,
    status: athlete.status,
    verifyId: athlete.verifyId,
    qrCodeUrl: athlete.qrCodeUrl,
    lastVerifiedAt: athlete.lastVerifiedAt,
    createdAt: athlete.createdAt,
    // Staged Head Coach/Player edit awaiting Admin approval (see the
    // Athlete model and updateAthlete) — the Admin Dashboard uses this to
    // tell a document-related edit apart from a routine field tweak when
    // deciding which "pending" tab a row belongs in.
    pendingChanges: athlete.pendingChanges || null,
  };
  return (athlete.assignments || [])
    .filter((a) => !teamFilter || a.team === teamFilter)
    .map((a) => {
      const fees = (a.fees || []).map((f) => ({ _id: f._id, amount: f.amount || 0, note: f.note || "" }));
      return {
        ...base,
        assignmentId: a._id,
        team: a.team,
        role: a.role,
        approvalStatus: a.approvalStatus,
        everApproved: a.everApproved,
        pendingRemoval: a.pendingRemoval,
        jerseyNumber: a.jerseyNumber ?? null,
        // `feeOwed` stays as the TOTAL across every fee row — every existing
        // consumer that just checks "> 0" or prints the number keeps working
        // unchanged; `fees` is the itemized breakdown for anything that
        // wants to show what's actually owed for.
        feeOwed: fees.reduce((sum, f) => sum + f.amount, 0),
        fees,
      };
    });
}

module.exports = flattenAssignments;
