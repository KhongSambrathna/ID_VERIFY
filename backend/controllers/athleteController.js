const Athlete = require("../models/Athlete");
const generateAthleteQR = require("../utils/generateQR");
const generateShortId = require("../utils/generateShortId");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

// POST /api/athletes  (admin, multipart/form-data: photo, documents[])
exports.createAthlete = async (req, res) => {
  try {
    const {
      fullName,
      khmerName,
      dateOfBirth,
      gender,
      team,
      role,
      address,
      isAvailable,
    } = req.body;

    const verifyId = await generateShortId();

    const athlete = new Athlete({
      verifyId,
      fullName,
      khmerName,
      dateOfBirth,
      gender,
      team,
      role,
      address,
      isAvailable: isAvailable === "false" ? false : true,
      createdBy: req.adminId,
    });

    if (req.files?.photo?.[0]) {
      const { url, publicId } = await uploadBufferToCloudinary(req.files.photo[0].buffer, {
        folder: "athlete-verify/photos",
        resourceType: "image",
      });
      athlete.photoUrl = url;
      athlete.photoPublicId = publicId;
    }

    if (req.files?.documents?.length) {
      athlete.supportingDocuments = await Promise.all(
        req.files.documents.map(async (f) => {
          const { url, publicId, resourceType } = await uploadBufferToCloudinary(f.buffer, {
            folder: "athlete-verify/documents",
            resourceType: "auto", // handles both images and PDFs
          });
          return { label: f.originalname, fileUrl: url, publicId, resourceType };
        })
      );
    }

    // generate the QR code that points to this athlete's public verify page
    const qr = await generateAthleteQR(athlete.verifyId);
    athlete.qrCodeUrl = qr.url;
    athlete.qrCodePublicId = qr.publicId;

    await athlete.save();
    res.status(201).json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes  (admin - list all, for the dashboard)
exports.getAllAthletes = async (req, res) => {
  try {
    const athletes = await Athlete.find().sort({ createdAt: -1 });
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/:id  (admin - single record for editing)
exports.getAthleteById = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id  (admin - update record, e.g. approve/reject)
exports.updateAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/athletes/:id  (admin)
exports.deleteAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findByIdAndDelete(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });

    // best-effort cleanup of the associated Cloudinary assets — failures here
    // shouldn't block the delete response, so just log them
    const cleanupJobs = [];
    if (athlete.photoPublicId) {
      cleanupJobs.push(cloudinary.uploader.destroy(athlete.photoPublicId));
    }
    if (athlete.qrCodePublicId) {
      cleanupJobs.push(cloudinary.uploader.destroy(athlete.qrCodePublicId));
    }
    (athlete.supportingDocuments || []).forEach((doc) => {
      if (doc.publicId) {
        cleanupJobs.push(
          cloudinary.uploader.destroy(doc.publicId, { resource_type: doc.resourceType || "image" })
        );
      }
    });
    Promise.allSettled(cleanupJobs).then((results) => {
      results.forEach((r) => {
        if (r.status === "rejected") console.warn("Cloudinary cleanup failed:", r.reason?.message);
      });
    });

    res.json({ message: "Athlete deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/verify/:verifyId  (PUBLIC - what the QR code scan opens)
exports.verifyAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findOne({ verifyId: req.params.verifyId }).select(
      "fullName khmerName dateOfBirth gender team role address status isAvailable photoUrl verifyId createdAt"
    );
    if (!athlete) return res.status(404).json({ message: "No record found for this ID" });
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
