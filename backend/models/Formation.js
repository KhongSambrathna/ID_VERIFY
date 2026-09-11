const mongoose = require("mongoose");

// A tactical formation "poster" — players from an already-created Squad
// List (Lineup) assigned into fixed row slots (Forwards / Midfielders /
// Defenders / Goalkeeper) for a specific match, then saved as a JPG.
// `row` + `slot` are the source of truth for where a player sits; `x`/`y`
// (0-100, % of the pitch area) are computed from those at save time so the
// poster can still render with simple absolute positioning.
const formationSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    team: {
      type: String,
      required: true,
    },
    name: {
      // e.g., "vs Angkor FC - Round 3", "4-4-2 starting XI"
      type: String,
      required: true,
    },
    // Which preset row layout this was built with — "4-3-3", "4-4-2", etc.
    // Used to redraw the same slot groups when reopened for editing.
    shape: {
      type: String,
      default: "4-3-3",
    },
    // The Squad List this formation's players were drawn from — a
    // formation can only place athletes who belong to some Lineup, not the
    // full team roster directly.
    sourceLineup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lineup",
      default: null,
    },
    positions: [
      {
        athleteId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Athlete",
        },
        row: { type: String, enum: ["FWD", "MID", "DEF", "GK"] },
        slot: { type: Number }, // 0-based index within the row
        x: { type: Number, required: true }, // 0-100, % from left
        y: { type: Number, required: true }, // 0-100, % from top
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Formation", formationSchema);
