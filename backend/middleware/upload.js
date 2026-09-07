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
  cb(new Error("Only image and PDF files are allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
