// App-link API → the school-management app shows a student their OWN
// training (attendance, balance, what to pay) on the student's page there,
// so they don't need a second account. Same per-app key as the other link
// routes (middleware/linkKey.js) — give the school app its own key, e.g.
//   LINK_API_KEYS=tournament:…,school:…long-random…
// The student is found by the school-management _id saved on import
// (Athlete.schoolStudentId) — nothing else about other players is returned.
//
// បង្ហាញព័ត៌មានហ្វឹកហាត់របស់សិស្សម្នាក់ៗ ក្នុងកម្មវិធីសាលា
const Athlete = require("../models/Athlete");
const { athleteTraining } = require("./trainingFeeController");

// GET /api/link/v1/training/school-student/:id?month=YYYY-MM
exports.trainingForSchoolStudent = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ message: "Bad student id" });

    const athletes = await Athlete.find({ schoolStudentId: id })
      .select("fullName khmerName verifyId photoUrl assignments")
      .lean();
    if (!athletes.length) return res.json({ linked: false, teams: [] });

    const teams = [];
    for (const a of athletes) {
      const names = [
        ...new Set(
          (a.assignments || [])
            .filter((x) => x.approvalStatus === "approved" && !x.pendingRemoval)
            .map((x) => x.team)
        ),
      ];
      for (const name of names) {
        const t = await athleteTraining(a, name, req.query.month);
        if (t) teams.push(t);
      }
    }
    const a = athletes[0];
    res.json({
      linked: true,
      athlete: { fullName: a.fullName, khmerName: a.khmerName || "", verifyId: a.verifyId, photoUrl: a.photoUrl || null },
      teams,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
