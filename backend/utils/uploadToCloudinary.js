const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

/**
 * Uploads a Buffer (e.g. from multer's memoryStorage, or from QRCode.toBuffer)
 * to Cloudinary and returns its public URL + public_id (needed later if you
 * ever want to delete the asset).
 *
 * @param {Buffer} buffer - the file data
 * @param {object} options
 * @param {string} options.folder - Cloudinary folder to store it under
 * @param {string} [options.publicId] - optional fixed public_id (e.g. verifyId for QR codes)
 * @param {string} [options.resourceType] - "image" | "raw" | "auto" (default "auto" — handles PDFs too)
 * @returns {Promise<{ url: string, publicId: string }>}
 */
function uploadBufferToCloudinary(buffer, { folder, publicId, resourceType = "auto" }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type });
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = uploadBufferToCloudinary;
