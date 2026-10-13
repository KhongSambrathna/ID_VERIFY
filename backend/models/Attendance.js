const mongoose = require("mongoose");

// One attendance SESSION = one training or match gathering for a team on a
// given date, with a per-athlete status recorded for whoever was on the
// roster. Kept deliberately separate from Lineup/Formation/Starting XI
// (who's in the squad / on the pitch): this is a simple day-to-day
// "who actually showed up" log, not a tactical sheet.
//
// One record per athlete (deduped on the client before saving) — a person
// with two roles on the same team is still one person attending once.
// fullName/jerseyNumber/role are snapshots (same reasoning as Tournament
// registrations) so an old session keeps making sense even if the athlete's
// profile is edited or they leave the team later.
const attendanceRecordSchema = new mongoose.Schema(
  {
    athlete: { type: mongoose.Schema.Types.ObjectId, ref: "Athlete", required: true },
    fullName: { type: String, default: "" }, // snapshot
    jerseyNumber: { type: Number, default: null }, // snapshot
    role: { type: String, default: "PLAYER" }, // snapshot
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      default: "present",
    },
    // Optional one-line reason/detail, e.g. "sick", "school exam",
    // "left at halftime" — free text, never gates anything.
    note: { type: String, default: "", trim: true },
  },
  { _id: true }
);

const attendanceSchema = new mongoose.Schema(
  {
    team: { type: String, required: true },
    // "training" = a practice session; "match" = an actual match/game day.
    type: {
      type: String,
      enum: ["training", "match"],
      default: "training",
    },
    // The calendar day this session happened — a plain date (no time), so
    // "Morning training, 2026-10-13" and "Evening training, 2026-10-13"
    // are two separate sessions sharing the same day.
    date: { type: Date, required: true },
    // Optional short label, e.g. "Morning session" or "vs Angkor FC —
    // Round 5". Purely cosmetic; never required.
    title: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    records: { type: [attendanceRecordSchema], default: [] },
    // Who recorded it — set from the authenticated Admin/Head Coach, never
    // from the request body.
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

// Most recent session first — the natural order for both the list view and
// any "last attended" logic.
attendanceSchema.index({ team: 1, date: -1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
