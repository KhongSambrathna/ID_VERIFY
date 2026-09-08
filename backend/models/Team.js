const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    // canonical team name — chosen from a dropdown everywhere in the app so
    // athlete records and Head Coach accounts always match exactly, instead
    // of relying on someone typing the same name the same way every time.
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Team", teamSchema);
