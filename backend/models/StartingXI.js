const mongoose = require("mongoose");

// A "Starting XI" matchday announcement graphic — a card-grid lineup
// (club vs opponent header, starter photo cards, substitutes list) — kept
// deliberately separate from Formation, which is the tactical pitch
// diagram. Both draw their players from an already-created Squad List
// (Lineup), never the full team roster directly.
const startingXISchema = new mongoose.Schema(
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
      // e.g., "vs Angkor FC - Round 5"
      type: String,
      required: true,
    },
    opponent: { type: String, default: "" },
    competition: { type: String, default: "" }, // e.g. "Cambodian League 2A"
    // Match format — 11/9/7/5-a-side. Purely informational: it changes the
    // "usually N players" hint in the UI, it does not cap how many starters
    // can actually be picked.
    squadSize: { type: Number, default: 11 },
    sourceLineup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lineup",
      default: null,
    },
    // Order matters — cards render in this order. Substitutes is just
    // "everyone else in the squad list", so it isn't picked separately.
    starters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Athlete" }],
    substitutes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Athlete" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("StartingXI", startingXISchema);
