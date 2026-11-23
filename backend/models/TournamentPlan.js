const mongoose = require("mongoose");

// A planned trophy / tournament — the calendar of what's coming up:
// which trophy, which days it's played, which kit, which age group
// (U13, U15… or Open), men / women / mixed, where, how many teams.
// Planning only — the real tournament (registration, squads, rules) is
// still made in Tournaments when it's time.
const playDaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    time: { type: String, trim: true, default: "" }, // "15:00"
    note: { type: String, trim: true, default: "" }, // e.g. "semi-finals"
  },
  { _id: true }
);

const tournamentPlanSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    trophy: { type: String, trim: true, default: "" },
    kit: { type: String, trim: true, default: "" },
    ageGroup: { type: String, trim: true, default: "" }, // "U15", "Open"…
    gender: { type: String, enum: ["male", "female", "mixed"], default: "male" },
    location: { type: String, trim: true, default: "" },
    teamsCount: { type: Number, min: 0, default: null },
    teams: { type: String, trim: true, default: "" }, // free text list
    playDays: { type: [playDaySchema], default: [] },
    status: { type: String, enum: ["planned", "confirmed", "done", "cancelled"], default: "planned" },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TournamentPlan", tournamentPlanSchema);
