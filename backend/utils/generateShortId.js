const Counter = require("../models/Counter");

async function nextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

/**
 * Generates a short, printable, all-numeric ID for the athlete card,
 * e.g. "001-100-2991" — easy to read and remember.
 * - First group: sequential registration number (001, 002, 003...)
 * - Second group: random 3-digit check code
 * - Third group: random 4-digit code
 * This is the ID printed on the card and embedded in the QR code —
 * short enough to read/type by hand if the QR can't be scanned.
 */
async function generateShortId() {
  const seq = await nextSequence("athlete");
  const seqPart = String(seq).padStart(3, "0");
  const groupTwo = String(Math.floor(Math.random() * 900) + 100); // 3-digit
  const groupThree = String(Math.floor(Math.random() * 9000) + 1000); // 4-digit
  return `${seqPart}-${groupTwo}-${groupThree}`;
}

module.exports = generateShortId;
