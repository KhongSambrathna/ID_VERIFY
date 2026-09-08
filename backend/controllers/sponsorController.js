const Sponsor = require("../models/Sponsor");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

// GET /api/sponsors  (PUBLIC) — logos shown in the "Trusted by" strip on the
// Landing and About pages.
exports.listSponsors = async (req, res) => {
  try {
    const sponsors = await Sponsor.find().sort({ order: 1, createdAt: 1 });
    res.json(sponsors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/sponsors  (admin, multipart/form-data: name, logo)
exports.createSponsor = async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!req.files?.logo?.[0]) {
      return res.status(400).json({ message: "Logo image is required" });
    }

    const { url, publicId } = await uploadBufferToCloudinary(req.files.logo[0].buffer, {
      folder: "athlete-verify/sponsors",
      resourceType: "image",
    });

    const count = await Sponsor.countDocuments();
    const sponsor = await Sponsor.create({
      name,
      logoUrl: url,
      logoPublicId: publicId,
      order: count,
    });
    res.status(201).json(sponsor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/sponsors/:id  (admin) — rename, reorder, and/or replace the logo image
exports.updateSponsor = async (req, res) => {
  try {
    const sponsor = await Sponsor.findById(req.params.id);
    if (!sponsor) return res.status(404).json({ message: "Sponsor not found" });

    if (req.body.name !== undefined) {
      const name = req.body.name.trim();
      if (name) sponsor.name = name;
    }
    if (req.body.order !== undefined && !Number.isNaN(Number(req.body.order))) {
      sponsor.order = Number(req.body.order);
    }

    if (req.files?.logo?.[0]) {
      const oldPublicId = sponsor.logoPublicId;
      const { url, publicId } = await uploadBufferToCloudinary(req.files.logo[0].buffer, {
        folder: "athlete-verify/sponsors",
        resourceType: "image",
      });
      sponsor.logoUrl = url;
      sponsor.logoPublicId = publicId;
      if (oldPublicId) {
        cloudinary.uploader
          .destroy(oldPublicId)
          .catch((err) => console.warn("Old sponsor logo cleanup failed:", err.message));
      }
    }

    await sponsor.save();
    res.json(sponsor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/sponsors/:id  (admin)
exports.deleteSponsor = async (req, res) => {
  try {
    const sponsor = await Sponsor.findByIdAndDelete(req.params.id);
    if (!sponsor) return res.status(404).json({ message: "Sponsor not found" });
    if (sponsor.logoPublicId) {
      cloudinary.uploader
        .destroy(sponsor.logoPublicId)
        .catch((err) => console.warn("Sponsor logo cleanup failed:", err.message));
    }
    res.json({ message: "Sponsor deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
