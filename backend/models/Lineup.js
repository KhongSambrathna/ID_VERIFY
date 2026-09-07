const mongoose = require("mongoose");

const lineupSchema = new mongoose.Schema(
  {
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    team: {
      type: String,
      required: true,
    },
    name: {
      // e.g., "Starting 11", "Substitutes", etc.
      type: String,
      required: true,
    },
    athletes: [
      {
        athleteId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Athlete",
        },
      },
    ],
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lineup", lineupSchema);