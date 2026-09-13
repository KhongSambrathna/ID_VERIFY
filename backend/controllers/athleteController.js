const Athlete = require("../models/Athlete");
const ScanLog = require("../models/ScanLog");
const generateAthleteQR = require("../utils/generateQR");
const generateShortId = require("../utils/generateShortId");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const cloudinary = require("../config/cloudinary");
const flattenAssignments = require("../utils/flattenAssignments");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

function toBool(value) {
  if (typeof value === "boolean") return value;
  return value === "true" || value === true;
}

// Best-effort Cloudinary cleanup (photo, QR, supporting documents) for a
// person being fully deleted. Fire-and-forget — a slow/failed cleanup
// shouldn't hold up the delete response, just gets logged.
function cleanupAthleteAssets(athlete) {
  const cleanupJobs = [];
  if (athlete.photoPublicId) cleanupJobs.push(cloudinary.uploader.destroy(athlete.photoPublicId));
  if (athlete.qrCodePublicId) cleanupJobs.push(cloudinary.uploader.destroy(athlete.qrCodePublicId));
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
}

// POST /api/athletes  (admin or head coach, multipart/form-data: photo, documents[])
// Registers a brand-new person with their first team/role assignment. To
// add another team/role to a person who's ALREADY in the system, use
// POST /api/athletes/:id/assignments instead (see addAssignment below) —
// that keeps the same profile/photo/verifyId/QR rather than duplicating it.
// A Head Coach can only register players for their own team, and whatever
// they submit starts out as approvalStatus "pending" on that assignment —
// hidden from public search/verify — until an Admin approves it.
// Admin-created assignments stay "approved" (the schema default).
exports.createAthlete = async (req, res) => {
  try {
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const { fullName, khmerName, dateOfBirth, gender, role, address, isAvailable } = req.body;

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
      address,
      assignments: team
        ? [
            {
              team,
              role: role || "PLAYER",
              approvalStatus: isHeadCoach ? "pending" : "approved",
            },
          ]
        : [],
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

    if (isHeadCoach && team) {
      notifyAdmins(`🆕 ${athlete.fullName} was added to ${team} by a Head Coach — needs approval.`);
    }

    res.status(201).json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes  (admin - every team unless ?team= is given; head coach
// and player - always forced to their own team, regardless of any ?team=
// they pass, so neither can browse other teams' rosters through this
// endpoint) Returns one row PER team/role assignment (see flattenAssignments)
// — a person on 2 teams appears as 2 rows, each carrying that team's own
// role and approval state.
exports.getAllAthletes = async (req, res) => {
  try {
    const isTeamScoped = req.adminRole === "HEAD_COACH" || req.adminRole === "PLAYER";
    const team = isTeamScoped ? req.adminTeam : req.query.team || null;
    const filter = team ? { "assignments.team": team } : {};
    const athletes = await Athlete.find(filter).sort({ createdAt: -1 });
    const rows = athletes.flatMap((a) => flattenAssignments(a, team));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/:id  (admin - any record; head coach and player - only a
// person who has at least one assignment on their own team) — returns the
// RAW person document (full `assignments` array included), for the Edit
// page and the ID-card page, both of which need to see every team/role
// this person has. A Player account only ever reads this (the route never
// allows it to hit any write endpoint), but stays team-scoped just the same.
exports.getAthleteById = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const isTeamScoped = req.adminRole === "HEAD_COACH" || req.adminRole === "PLAYER";
    if (isTeamScoped && !athlete.assignments.some((a) => a.team === req.adminTeam)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Reference/ID documents (national ID copy, birth certificate, etc.) are
    // for Admin and Head Coach only — used to prove identity in person when
    // an opposing team asks to check. A shared Player login can see
    // everything else on this record (fees included) but never these.
    if (req.adminRole === "PLAYER") {
      const obj = athlete.toObject();
      delete obj.supportingDocuments;
      return res.json(obj);
    }

    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id  — edits this person's SHARED profile fields only
// (name, DOB, gender, address, photo, plus admin-only `status`). Team/role
// assignments are managed separately below (add/edit/remove), since one
// edit here can't mean "for which team" once a person has more than one.
const ADMIN_EDITABLE_FIELDS = ["fullName", "khmerName", "dateOfBirth", "gender", "address", "status"];
const HEAD_COACH_EDITABLE_FIELDS = ["fullName", "khmerName", "dateOfBirth", "gender", "address"];

// Date-of-birth needs its own comparison — the form sends "YYYY-MM-DD" but
// the stored value is a Date — so a plain string compare would treat every
// submit as "changed" even when the date is identical.
function valuesDiffer(field, current, incoming) {
  if (field === "dateOfBirth") {
    const toDay = (v) => {
      if (!v) return "";
      const d = new Date(v);
      return isNaN(d) ? "" : d.toISOString().slice(0, 10);
    };
    return toDay(current) !== toDay(incoming);
  }
  return String(current ?? "") !== String(incoming ?? "");
}

exports.updateAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach && !athlete.assignments.some((a) => a.team === req.adminTeam)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Only apply/save a field, and only count it toward `changed`, if it's
    // actually different from what's already stored — submitting the form
    // unmodified (e.g. just opening Edit and clicking Save) must be a no-op,
    // not a re-approval trigger.
    let changed = false;
    const editableFields = isHeadCoach ? HEAD_COACH_EDITABLE_FIELDS : ADMIN_EDITABLE_FIELDS;
    editableFields.forEach((field) => {
      if (req.body[field] === undefined) return;
      if (valuesDiffer(field, athlete[field], req.body[field])) {
        athlete[field] = req.body[field];
        changed = true;
      }
    });
    if (req.body.isAvailable !== undefined) {
      const incoming = toBool(req.body.isAvailable);
      if (athlete.isAvailable !== incoming) {
        athlete.isAvailable = incoming;
        changed = true;
      }
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
      changed = true;
      if (oldPhotoPublicId) {
        cloudinary.uploader.destroy(oldPhotoPublicId).catch((err) =>
          console.warn("Old photo cleanup failed:", err.message)
        );
      }
    }

    // Reference/ID documents (national ID copy, birth certificate, family
    // book, etc.) — kept for Admin/Head Coach to prove identity in person
    // when an opposing team asks to check. Unlike fee/debt rows, adding or
    // removing one of these IS treated like any other shared-profile edit:
    // it counts toward `changed` below, so a Head Coach doing this sends
    // their own-team assignment(s) back to "pending" the same as editing
    // the name/DOB/etc. would.
    if (req.body.removeDocumentIds) {
      let removeIds = [];
      try {
        removeIds = JSON.parse(req.body.removeDocumentIds);
      } catch {
        removeIds = String(req.body.removeDocumentIds).split(",");
      }
      removeIds = removeIds.map(String).filter(Boolean);
      if (removeIds.length) {
        const toRemove = athlete.supportingDocuments.filter((d) => removeIds.includes(String(d._id)));
        if (toRemove.length) {
          athlete.supportingDocuments = athlete.supportingDocuments.filter(
            (d) => !removeIds.includes(String(d._id))
          );
          changed = true;
          toRemove.forEach((doc) => {
            if (doc.publicId) {
              cloudinary.uploader
                .destroy(doc.publicId, { resource_type: doc.resourceType || "image" })
                .catch((err) => console.warn("Old document cleanup failed:", err.message));
            }
          });
        }
      }
    }

    if (req.files?.documents?.length) {
      const newDocs = await Promise.all(
        req.files.documents.map(async (f) => {
          const { url, publicId, resourceType } = await uploadBufferToCloudinary(f.buffer, {
            folder: "athlete-verify/documents",
            resourceType: "auto",
          });
          return { label: f.originalname, fileUrl: url, publicId, resourceType };
        })
      );
      athlete.supportingDocuments = [...(athlete.supportingDocuments || []), ...newDocs];
      changed = true;
    }

    // Nothing actually changed (viewed the record, maybe only touched a fee
    // amount elsewhere, then hit Save) — don't write anything and don't
    // touch approval status; just tell the caller there was nothing to do.
    if (!changed) {
      return res.json({ ...athlete.toObject(), noChanges: true });
    }

    // A Head Coach editing this shared profile sends their OWN team's
    // assignment(s) back to "pending" for re-review — this never touches
    // the person's OTHER teams' assignments, which stay exactly as they
    // were (still approved/public if they already were). This only fires
    // when a real change was made above.
    if (isHeadCoach) {
      athlete.assignments.forEach((a) => {
        if (a.team === req.adminTeam) a.approvalStatus = "pending";
      });
    }

    await athlete.save();

    if (isHeadCoach) {
      notifyAdmins(`✏️ ${athlete.fullName}'s record on ${req.adminTeam} was edited — needs re-approval.`);
    }

    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/athletes/:id/assignments  — add a new team/role to an EXISTING
// person (same profile, photo, verifyId/QR — nothing duplicated). This is
// what the Add-athlete "possible match" flow calls when a coach/admin
// confirms a name match really is the same real person joining another
// team, or taking on another role. A Head Coach can only add for their own
// team; an Admin can add for any team.
exports.addAssignment = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const team = isHeadCoach ? req.adminTeam : req.body.team;
    const role = req.body.role || "PLAYER";
    if (!team) return res.status(400).json({ message: "Team is required" });

    if (athlete.assignments.some((a) => a.team === team && a.role === role)) {
      return res.status(400).json({ message: "This person already has that exact team and role" });
    }

    athlete.assignments.push({
      team,
      role,
      approvalStatus: isHeadCoach ? "pending" : "approved",
    });
    await athlete.save();

    if (isHeadCoach) {
      notifyAdmins(`🆕 ${athlete.fullName} was added to ${team} (${role}) by a Head Coach — needs approval.`);
    }

    res.status(201).json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id/assignments/:assignmentId  — change the ROLE on one
// existing team assignment (the team itself is fixed — to move someone to a
// different team, remove this assignment and add a new one; fee/debt rows
// are managed separately below via addFee/updateFee/removeFee). A Head
// Coach can only touch an assignment on their own team, and doing so sends
// that one assignment back to "pending" for re-review.
exports.updateAssignment = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const assignment = athlete.assignments.id(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach && assignment.team !== req.adminTeam) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.body.role && req.body.role !== assignment.role) {
      assignment.role = req.body.role;
      if (isHeadCoach) assignment.approvalStatus = "pending";
    }

    // Shirt/kit number for this team — a squad-list convenience, not
    // something that affects identity/eligibility, so (like fees) it never
    // flips approvalStatus even for a Head Coach.
    if (req.body.jerseyNumber !== undefined) {
      const raw = req.body.jerseyNumber;
      if (raw === "" || raw === null) {
        assignment.jerseyNumber = null;
      } else {
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0 || num > 99) {
          return res.status(400).json({ message: "Jersey number must be between 0 and 99" });
        }
        assignment.jerseyNumber = num;
      }
    }

    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id/renew — marks this person's identity as freshly
// re-checked today (Admin any record; Head Coach only their own team).
// Just stamps `lastVerifiedAt` — never blocks or gates anything else, it
// only clears the "needs renewal" badge once it's over a year old.
exports.renewVerification = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach && !athlete.assignments.some((a) => a.team === req.adminTeam)) {
      return res.status(403).json({ message: "Access denied" });
    }
    athlete.lastVerifiedAt = new Date();
    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fee/debt line items on one assignment — e.g. "Uniform fee: $10" and
// "2026 registration: $15" as two separate rows, so adding a newly-owed fee
// never overwrites what was already recorded. None of these ever flips the
// assignment's approvalStatus — recording money owed is internal
// bookkeeping, never shown on a card or in public search/verify.
function findAssignmentForFee(req) {
  return Athlete.findById(req.params.id).then((athlete) => {
    if (!athlete) return { error: [404, "Athlete not found"] };
    const assignment = athlete.assignments.id(req.params.assignmentId);
    if (!assignment) return { error: [404, "Assignment not found"] };
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach && assignment.team !== req.adminTeam) {
      return { error: [403, "Access denied"] };
    }
    return { athlete, assignment };
  });
}

// POST /api/athletes/:id/assignments/:assignmentId/fees — add one fee/debt row.
exports.addFee = async (req, res) => {
  try {
    const { athlete, assignment, error } = await findAssignmentForFee(req);
    if (error) return res.status(error[0]).json({ message: error[1] });

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    const note = String(req.body.note || "").slice(0, 200);
    assignment.fees.push({ amount, note });
    await athlete.save();

    const text = `💵 New fee for ${athlete.fullName} (${assignment.team}): $${amount}${note ? ` — ${note}` : ""}`;
    notifyAdmins(text);
    notifyTeamCoaches(assignment.team, text);

    res.status(201).json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id/assignments/:assignmentId/fees/:feeId — edit one row's amount/note.
exports.updateFee = async (req, res) => {
  try {
    const { athlete, assignment, error } = await findAssignmentForFee(req);
    if (error) return res.status(error[0]).json({ message: error[1] });

    const fee = assignment.fees.id(req.params.feeId);
    if (!fee) return res.status(404).json({ message: "Fee row not found" });

    if (req.body.amount !== undefined) {
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }
      fee.amount = amount;
    }
    if (req.body.note !== undefined) {
      fee.note = String(req.body.note).slice(0, 200);
    }

    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/athletes/:id/assignments/:assignmentId/fees/:feeId — remove one row
// (e.g. it was paid off, or entered by mistake).
exports.removeFee = async (req, res) => {
  try {
    const { athlete, assignment, error } = await findAssignmentForFee(req);
    if (error) return res.status(error[0]).json({ message: error[1] });

    assignment.fees = assignment.fees.filter((f) => String(f._id) !== String(req.params.feeId));
    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/athletes/:id/assignments/:assignmentId  — remove one team/role.
// Admin: removed immediately. Head Coach: only allowed on their own team's
// assignment, and it's not an immediate delete — it's flagged pendingRemoval
// and stays visible until an Admin confirms (approve) or declines (reject)
// it, same as a brand-new assignment needs approval either way. If this
// was the person's ONLY assignment, removing it (by an Admin, or once an
// Admin confirms a Head Coach's request) deletes the whole person record —
// there's nothing left to keep it around for.
exports.removeAssignment = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const assignment = athlete.assignments.id(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach) {
      if (assignment.team !== req.adminTeam) {
        return res.status(403).json({ message: "Access denied" });
      }
      assignment.pendingRemoval = true;
      await athlete.save();
      return res.json(athlete);
    }

    const wasLast = athlete.assignments.length === 1;
    athlete.assignments = athlete.assignments.filter((a) => String(a._id) !== String(assignment._id));
    if (wasLast) {
      cleanupAthleteAssets(athlete);
      await Athlete.findByIdAndDelete(athlete._id);
      return res.json({
        message: "Assignment removed — it was their only team, so the whole record was deleted",
        deletedAthlete: true,
      });
    }
    await athlete.save();
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id/assignments/:assignmentId/approve  (admin only) —
// confirms whatever this assignment is waiting on: a pending ADD becomes
// "approved" (now public); a pending REMOVAL is actually carried out (and
// cascades to a full person-delete if it was their last assignment).
exports.approveAssignment = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const assignment = athlete.assignments.id(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const team = assignment.team;
    const fullName = athlete.fullName;

    if (assignment.pendingRemoval) {
      const wasLast = athlete.assignments.length === 1;
      athlete.assignments = athlete.assignments.filter((a) => String(a._id) !== String(assignment._id));
      if (wasLast) {
        cleanupAthleteAssets(athlete);
        await Athlete.findByIdAndDelete(athlete._id);
        notifyTeamCoaches(team, `✅ ${fullName}'s removal from ${team} was confirmed by Admin.`);
        return res.json({
          message: "Removal confirmed — it was their only team, so the whole record was deleted",
          deletedAthlete: true,
        });
      }
      await athlete.save();
      notifyTeamCoaches(team, `✅ ${fullName}'s removal from ${team} was confirmed by Admin.`);
      return res.json(athlete);
    }

    assignment.approvalStatus = "approved";
    await athlete.save();
    notifyTeamCoaches(team, `✅ ${fullName}'s ${team} assignment was approved by Admin.`);
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/:id/assignments/:assignmentId/reject  (admin only) —
// declines whatever this assignment is waiting on: a pending ADD is removed
// entirely (it's as if it was never added — cascades to a full delete if it
// was the person's only assignment); a pending REMOVAL request is declined,
// which just clears the flag and keeps the assignment as it was.
exports.rejectAssignment = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const assignment = athlete.assignments.id(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const team = assignment.team;
    const fullName = athlete.fullName;

    if (assignment.pendingRemoval) {
      assignment.pendingRemoval = false;
      await athlete.save();
      notifyTeamCoaches(team, `↩️ Admin declined the removal request for ${fullName} on ${team} — they stay on the team.`);
      return res.json(athlete);
    }

    const wasLast = athlete.assignments.length === 1;
    athlete.assignments = athlete.assignments.filter((a) => String(a._id) !== String(assignment._id));
    if (wasLast) {
      cleanupAthleteAssets(athlete);
      await Athlete.findByIdAndDelete(athlete._id);
      notifyTeamCoaches(team, `❌ ${fullName}'s ${team} assignment was rejected by Admin.`);
      return res.json({
        message: "Rejected — it was their only team, so the whole record was deleted",
        deletedAthlete: true,
      });
    }
    await athlete.save();
    notifyTeamCoaches(team, `❌ ${fullName}'s ${team} assignment was rejected by Admin.`);
    res.json(athlete);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/athletes/:id  (admin only — a Head Coach removes people
// through removeAssignment above instead, which always needs Admin
// confirmation) — deletes the whole person record and its Cloudinary assets
// outright, regardless of how many teams/roles they had.
exports.deleteAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });

    cleanupAthleteAssets(athlete);
    await Athlete.findByIdAndDelete(athlete._id);

    res.json({ message: "Athlete deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/check-duplicate?fullName=...&khmerName=...  (admin/head
// coach) — used by the Add-athlete form to warn before registering a player
// whose name already exists, so the same real person doesn't accidentally
// get an untracked second profile. Not a hard block — two different people
// can share a name — so it just returns whatever near-matches exist (with
// their current team/role assignments) and lets the caller decide whether
// to register a new person or add a team/role to the matched one instead
// (via addAssignment above). A Head Coach only sees matches that include
// their own team.
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
    if (req.adminRole === "HEAD_COACH") query["assignments.team"] = req.adminTeam;

    const duplicates = await Athlete.find(query)
      .select("fullName khmerName assignments verifyId photoUrl")
      .limit(5);

    res.json({ duplicates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/search?q=...  (PUBLIC) — find a player by name or ID number,
// for anyone whose QR scanner isn't cooperating. Only approved assignments
// are ever shown here — a record with zero approved assignments (still
// pending, or all its assignments were removed) doesn't appear at all.
exports.searchAthletes = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ message: "Type at least 2 characters to search" });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, "i");

    const athletes = await Athlete.find({
      "assignments.approvalStatus": "approved",
      $or: [{ fullName: pattern }, { khmerName: pattern }, { verifyId: pattern }],
    })
      .select("verifyId fullName khmerName assignments status isAvailable photoUrl")
      .sort({ fullName: 1 })
      .limit(20);

    const results = athletes.map((a) => {
      const approved = a.assignments.filter((x) => x.approvalStatus === "approved");
      return {
        _id: a._id,
        verifyId: a.verifyId,
        fullName: a.fullName,
        khmerName: a.khmerName,
        status: a.status,
        isAvailable: a.isAvailable,
        photoUrl: a.photoUrl,
        memberships: approved.map((x) => ({ team: x.team, role: x.role })),
        // flat fallback for simple display — every approved team/role joined
        team: approved.map((x) => x.team).join(", "),
        role: approved.map((x) => x.role).join(", "),
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/verify/:verifyId  (PUBLIC - what the QR code scan opens)
// Only approved assignments are ever exposed here. If NONE of this person's
// assignments are approved yet (a brand-new record, or every assignment is
// still pending/removed), the record is treated as not-yet-public — same
// 404 behavior as before this feature existed.
exports.verifyAthlete = async (req, res) => {
  try {
    const athlete = await Athlete.findOne({ verifyId: req.params.verifyId }).select(
      "fullName khmerName dateOfBirth gender address status isAvailable photoUrl verifyId assignments createdAt"
    );
    if (!athlete) return res.status(404).json({ message: "No record found for this ID" });

    const approved = athlete.assignments.filter((a) => a.approvalStatus === "approved");
    if (approved.length === 0) {
      return res.status(404).json({ message: "This record is pending admin approval and isn't public yet" });
    }

    // Best-effort scan log — timestamp + IP/device only, never a "who"
    // (this page has no login). Fire-and-forget: a logging hiccup must
    // never break the actual verify response.
    ScanLog.create({
      athlete: athlete._id,
      verifyId: athlete.verifyId,
      ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    }).catch((err) => console.warn("Scan log write failed:", err.message));

    res.json({
      _id: athlete._id,
      fullName: athlete.fullName,
      khmerName: athlete.khmerName,
      dateOfBirth: athlete.dateOfBirth,
      gender: athlete.gender,
      address: athlete.address,
      status: athlete.status,
      isAvailable: athlete.isAvailable,
      photoUrl: athlete.photoUrl,
      verifyId: athlete.verifyId,
      createdAt: athlete.createdAt,
      memberships: approved.map((a) => ({ team: a.team, role: a.role })),
      team: approved.map((a) => a.team).join(", "),
      role: approved.map((a) => a.role).join(", "),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/:id/scan-logs  (admin - any record; head coach - own
// team only) — the most recent public verify hits for one person, newest
// first. IP/device only, since the verify page has no login and there is
// no real "who" to show.
exports.getScanLogs = async (req, res) => {
  try {
    const athlete = await Athlete.findById(req.params.id);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    if (isHeadCoach && !athlete.assignments.some((a) => a.team === req.adminTeam)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const logs = await ScanLog.find({ athlete: athlete._id }).sort({ scannedAt: -1 }).limit(50);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/stats  (admin - club-wide, or one team via ?team=;
// head coach - always forced to their own team) — quick counts for a
// dashboard: how many people per team, how many still waiting on approval,
// how much is owed in total. Never a public route.
exports.getStats = async (req, res) => {
  try {
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const teamFilter = isHeadCoach ? req.adminTeam : req.query.team || null;
    const filter = teamFilter ? { "assignments.team": teamFilter } : {};
    const athletes = await Athlete.find(filter);

    const perTeam = {};
    const seenPerTeam = {};
    let totalPending = 0;
    let totalDebt = 0;

    athletes.forEach((athlete) => {
      athlete.assignments.forEach((a) => {
        if (teamFilter && a.team !== teamFilter) return;
        if (!perTeam[a.team]) {
          perTeam[a.team] = { team: a.team, athleteCount: 0, pendingCount: 0, totalDebt: 0 };
          seenPerTeam[a.team] = new Set();
        }
        if (!seenPerTeam[a.team].has(String(athlete._id))) {
          seenPerTeam[a.team].add(String(athlete._id));
          perTeam[a.team].athleteCount += 1;
        }
        if (a.approvalStatus === "pending" || a.pendingRemoval) {
          perTeam[a.team].pendingCount += 1;
          totalPending += 1;
        }
        const owed = (a.fees || []).reduce((sum, f) => sum + (f.amount || 0), 0);
        perTeam[a.team].totalDebt += owed;
        totalDebt += owed;
      });
    });

    res.json({
      teams: Object.values(perTeam).sort((x, y) => x.team.localeCompare(y.team)),
      totalAthletes: athletes.length,
      totalPendingApprovals: totalPending,
      totalDebt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/athletes/export.csv  (admin - all teams or one via ?team=;
// head coach - own team forced) — a flat CSV of the visible roster, for
// handing to a federation or keeping an offline backup. Authenticated
// same as every other admin/coach route — never reachable publicly.
exports.exportRosterCsv = async (req, res) => {
  try {
    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const team = isHeadCoach ? req.adminTeam : req.query.team || null;
    const filter = team ? { "assignments.team": team } : {};
    const athletes = await Athlete.find(filter).sort({ fullName: 1 });
    const rows = athletes.flatMap((a) => flattenAssignments(a, team));

    const escapeCsv = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Team",
      "Full name",
      "Khmer name",
      "Jersey #",
      "Role",
      "Date of birth",
      "Gender",
      "Verify ID",
      "Status",
      "Available",
      "Approval",
      "Debt owed",
    ];
    const lines = [header.map(escapeCsv).join(",")];
    rows.forEach((r) => {
      lines.push(
        [
          r.team,
          r.fullName,
          r.khmerName || "",
          r.jerseyNumber ?? "",
          r.role,
          r.dateOfBirth ? new Date(r.dateOfBirth).toISOString().slice(0, 10) : "",
          r.gender || "",
          r.verifyId,
          r.status,
          r.isAvailable ? "Available" : "Not available",
          r.pendingRemoval ? "Removal requested" : r.approvalStatus,
          r.feeOwed || 0,
        ]
          .map(escapeCsv)
          .join(",")
      );
    });
    const csv = lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="roster${team ? "-" + team : ""}.csv"`);
    // Leading BOM so Excel opens the Khmer-name column as UTF-8 correctly.
    res.send("﻿" + csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/bulk-approve  (admin only) — body: { items:
// [{athleteId, assignmentId}, ...] }. Approves many pending assignments (or
// confirms many pending removals) in one request, for clearing a backlog.
// Each item is handled independently — one bad id doesn't stop the rest —
// and the response reports per-item success/failure.
exports.bulkApproveAssignments = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ message: "No items given" });

    const results = [];
    for (const item of items) {
      try {
        const athlete = await Athlete.findById(item.athleteId);
        if (!athlete) {
          results.push({ ...item, ok: false, message: "Athlete not found" });
          continue;
        }
        const assignment = athlete.assignments.id(item.assignmentId);
        if (!assignment) {
          results.push({ ...item, ok: false, message: "Assignment not found" });
          continue;
        }
        if (assignment.pendingRemoval) {
          const wasLast = athlete.assignments.length === 1;
          athlete.assignments = athlete.assignments.filter((a) => String(a._id) !== String(assignment._id));
          if (wasLast) {
            cleanupAthleteAssets(athlete);
            await Athlete.findByIdAndDelete(athlete._id);
          } else {
            await athlete.save();
          }
        } else {
          assignment.approvalStatus = "approved";
          await athlete.save();
        }
        results.push({ ...item, ok: true });
      } catch (err) {
        results.push({ ...item, ok: false, message: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/athletes/bulk-renew  (admin any; head coach only athletes on
// their own team) — body: { athleteIds: [...] }. Stamps lastVerifiedAt to
// today for each one, for clearing a backlog of "needs renewal" people from
// the dedicated Renewal page instead of one at a time. lastVerifiedAt is a
// whole-person field (not per-assignment), so this takes athlete ids
// directly rather than {athleteId, assignmentId} pairs. Each item is
// handled independently, same as bulk-approve above.
exports.bulkRenewVerification = async (req, res) => {
  try {
    const athleteIds = Array.isArray(req.body.athleteIds) ? req.body.athleteIds : [];
    if (!athleteIds.length) return res.status(400).json({ message: "No athletes given" });

    const isHeadCoach = req.adminRole === "HEAD_COACH";
    const results = [];
    for (const athleteId of athleteIds) {
      try {
        const athlete = await Athlete.findById(athleteId);
        if (!athlete) {
          results.push({ athleteId, ok: false, message: "Athlete not found" });
          continue;
        }
        if (isHeadCoach && !athlete.assignments.some((a) => a.team === req.adminTeam)) {
          results.push({ athleteId, ok: false, message: "Access denied" });
          continue;
        }
        athlete.lastVerifiedAt = new Date();
        await athlete.save();
        results.push({ athleteId, ok: true });
      } catch (err) {
        results.push({ athleteId, ok: false, message: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
