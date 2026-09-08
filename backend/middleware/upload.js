const multer = require("multer");
const path = require("path");

// Files are kept in memory as a Buffer and streamed straight to Cloudinary
// in the controller — nothing is written to local disk, so uploads survive
// server restarts/redeploys on hosts with ephemeral disks (e.g. Render free tier).
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|pdf/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  if (ext) return cb(null, true);
  // Marked as a 400 (bad request) rather than left to default to a 500 —
  // the server.js error handler uses this to send back a clean JSON
  // message instead of crashing with an HTML error page. iPhone photos
  // saved as .heic/.heif will also hit this — ask the user to pick
  // "Most Compatible" format in their phone's camera settings, or convert
  // to JPG before uploading.
  const err = new Error("Only JPG, PNG, WEBP, or PDF files are allowed");
  err.status = 400;
  cb(err);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
