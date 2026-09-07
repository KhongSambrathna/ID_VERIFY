const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const qrDir = path.join(__dirname, "..", "uploads", "qrcodes");
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

/**
 * Generates a QR code image that encodes the public verify URL for an athlete
 * e.g. http://localhost:5173/verify/<verifyId>
 * Returns the relative file path to store on the athlete record.
 */
async function generateAthleteQR(verifyId) {
  const verifyUrl = `${process.env.PUBLIC_BASE_URL}/verify/${verifyId}`;
  const fileName = `${verifyId}.png`;
  const filePath = path.join(qrDir, fileName);

  await QRCode.toFile(filePath, verifyUrl, {
    width: 400,
    margin: 2,
  });

  return `/uploads/qrcodes/${fileName}`;
}

module.exports = generateAthleteQR;
