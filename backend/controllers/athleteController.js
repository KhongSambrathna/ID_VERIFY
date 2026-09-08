const Athlete = require("../models/Athlete");
const generateAthleteQR = require("../utils/generateQR");
const generateShortId = require("../utils/generateShortId");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");

function toBool(value) {
  if (typeof value === "boolean") return value;
  return value === "true" || value === true;
}

// POST /api/athletes  (admin or head coach, multipart/form-data: photo, documents[])
// A Head Coach can only register players for their own team, and whatever
// they submit starts out as approvalStatus "pending" — hidden from public
// search/verify — until an Admin approves it. Admin-created records stay
// "approved" (the schema default), same as before this feature existed.
exports.createAthlete = async (req, res) => {
  try {
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const {
      fullName,
      khmerName,
      dateOfBirth,
      gender,
      role,
      address,
      isAvailable,
    } = req.body;

    const team = isHeadCoach ? req.adminTeam : req.body.team;
    if (isHeadCoach && !team) {
      return res.status(400).json({ message: "Your account has no team set — contact an admin" });
    }

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
      approvalStatus: isHeadCoach ? "pending" : "approved",
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

// GET /api/athletes  (admin - list all, for the dashboard; head coach - only
// their own team, regardless of any ?team= they pass, so they can't browse
// other teams' rosters through this endpoint)
exports.getAllAthletes = async (req, res) => {
  try {
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const filter = isHeadCoach ? { team: req.adminTeam } : req.query.team ? { team: req.query.team } : {};
    const athletes = await Athlete.find(filter).sort({ createdAt: -1 });
    res.json(athletes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/:id  (admin - any record; head coach - only their own team's)
exports.getAthleteById = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    if (req.adminRole === "HEAD_COACH" && athlete.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id  (admin - full edit form, or a quick partial update
// like { status } / { isAvailable } from the dashboard buttons; head coach -
// only their own team's players, and cannot move a player to another team
// or touch the ID-verification `status` badge — that stays admin-only)
const ADMIN_EDITABLE_FIELDS = [
  "fullName",
  "khmerName",
  "dateOfBirth",
  "gender",
  "team",
  "role",
  "address",
  "status",
];
const HEAD_COACH_EDITABLE_FIELDS = ["fullName", "khmerName", "dateOfBirth", "gender", "role", "address"];

exports.updateAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach && athlete.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    const editableFields = isHeadCoach ? HEAD_COACH_EDITABLE_FIELDS : ADMIN_EDITABLE_FIELDS;
    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) athlete[field] = req.body[field];
    });
    if (req.body.isAvailable !== undefined) {
      athlete.isAvailable = toBool(req.body.isAvailable);
    }

    // Optional new photo (multipart edit form) — replaces the old one.
    if (req.files?.photo?.[0]) {
      const oldPhotoPublicId = athlete.photoPublicId;
      const { url, publicId } = await uploadBufferToCloudinary(req.files.photo[0].buffer, {
        folder: "athlete-verify/photos",
        resourceType: "image",
      });
      athlete.photoUrl = url;
      athlete.photoPublicId = publicId;
      if (oldPhotoPublicId) {
        cloudinary.uploader.destroy(oldPhotoPublicId).catch((err) =>
          console.warn("Old photo cleanup failed:", err.message)
        );
      }
    }

    // Any Head Coach edit — to an already-approved record or still a pending
    // one — sends it back to "pending" for another Admin review before it's
    // public again. Admin edits never touch approvalStatus; approving is its
    // own explicit action (see approveAthlete below).
    if (isHeadCoach) {
      athlete.approvalStatus = "pending";
    }

    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id/approve  (admin only) — the explicit "make this
// Head-Coach-submitted record public" action.
exports.approveAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    athlete.approvalStatus = "approved";
    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/athletes/:id  (admin - any record; head coach - only their own team's)
exports.deleteAthlete = async (req, res) => {
  try {
    const existing = await Athlete.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Athlete not found" });
    if (req.adminRole === "HEAD_COACH" && existing.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    const athlete = await Athlete.findByIdAndDelete(req.params.id);

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

// GET /api/athletes/check-duplicate?fullName=...&khmerName=...  (admin/head
// coach) — used by the Add-athlete form to warn before registering a player
// whose name already exists, so the same person doesn't accidentally get a
// second record. Not a hard block — two different people can share a name —
// so it just returns whatever near-matches exist and lets the caller decide.
// A Head Coach only sees matches within their own team.
exports.checkDuplicateName = async (req, res) => {
  try {
    const fullName = (req.query.fullName || "").trim();
    const khmerName = (req.query.khmerName || "").trim();
    if (!fullName && !khmerName) return res.json({ duplicates: [] });

    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const orClauses = [];
    if (fullName) orClauses.push({ fullName: new RegExp(`^${escape(fullName)}$`, "i") });
    if (khmerName) orClauses.push({ khmerName: new RegExp(`^${escape(khmerName)}$`, "i") });

    const query = { $or: orClauses };
    if (req.query.excludeId) query._id = { $ne: req.query.excludeId };
    if (req.adminRole === "HEAD_COACH") query.team = req.adminTeam;

    const duplicates = await Athlete.find(query)
      .select("fullName khmerName team role verifyId photoUrl")
      .limit(5);

    res.json({ duplicates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/search?q=...  (PUBLIC) — find a player by name or ID number,
// for anyone whose QR scanner isn't cooperating. Only non-sensitive fields are
// returned here; the fuller record still lives behind /verify/:verifyId.
// Records still pending Admin approval never appear here.
exports.searchAthletes = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ message: "Type at least 2 characters to search" });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");

    const athletes = await Athlete.find({
      approvalStatus: "approved",
      $or: [{ fullName: pattern }, { khmerName: pattern }, { verifyId: pattern }],
    })
      .select("verifyId fullName khmerName team role status isAvailable photoUrl")
      .sort({ fullName: 1 })
      .limit(20);

    res.json(athletes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/verify/:verifyId  (PUBLIC - what the QR code scan opens)
// A record pending Admin approval is treated as not-yet-public here too, so
// scanning/printing a card before it's approved doesn't expose it.
exports.verifyAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findOne({ verifyId: req.params.verifyId }).select(
      "fullName khmerName dateOfBirth gender team role address status isAvailable photoUrl verifyId approvalStatus createdAt"
    );
    if (!athlete) return res.status(404).json({ message: "No record found for this ID" });
    if (athlete.approvalStatus === "pending") {
      return res.status(404).json({ message: "This record is pending admin approval and isn't public yet" });
    }
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
