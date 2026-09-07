const QRCode = require("qrcode");
const uploadBufferToCloudinary = require("./uploadToCloudinary");

/**
 * Generates a QR code image that encodes the public verify URL for an
 * athlete (e.g. https://your-app.vercel.app/verify/<verifyId>), uploads it
 * to Cloudinary, and returns its public URL + public_id.
 */
async function generateAthleteQR(verifyId) {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base || base.includes("localhost")) {
    console.warn(
      `[generateQR] PUBLIC_BASE_URL is "${base || "(not set)"}" — the QR code being ` +
        `generated right now will only open on your own machine. Set PUBLIC_BASE_URL ` +
        `to your real deployed frontend URL in the backend's environment variables.`
    );
  }
  const verifyUrl = `${base}/verify/${verifyId}`;

  const buffer = await QRCode.toBuffer(verifyUrl, {
    width: 400,
    margin: 2,
  });

  const { url, publicId } = await uploadBufferToCloudinary(buffer, {
    folder: "athlete-verify/qrcodes",
    publicId: verifyId, // fixed name so regenerating overwrites the old one
    resourceType: "image",
  });

  return { url, publicId };
}

module.exports = generateAthleteQR;
