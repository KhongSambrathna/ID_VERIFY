const mongoose = require("mongoose");

// A tactical formation "poster" — a team's players positioned on a pitch
// diagram for a specific match, drag-placed by the coach/admin and then
// saved as a JPG. Positions are stored as percentages (0-100) of the pitch
// area so the layout scales cleanly to any export size.
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
    positions: [
      {
        athleteId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Athlete",
        },
        x: { type: Number, required: true }, // 0-100, % from left
        y: { type: Number, required: true }, // 0-100, % from top
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Formation", formationSchema);
