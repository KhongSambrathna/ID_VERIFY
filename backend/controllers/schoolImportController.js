const mongoose = require("mongoose");
const Athlete = require("../models/Athlete");
const generateAthleteQR = require("../utils/generateQR");
const generateShortId = require("../utils/generateShortId");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

// 🏫 Import students from the school-management app (Admin only).
//
// Reads that app's MongoDB (SCHOOL_MONGO_URI, database school_management)
// directly — READ ONLY, nothing there is ever changed — and copies the
// students the Admin ticks into a team here as new athletes: Khmer + Latin
// name, gender, date of birth, place of birth, address and photo. Each
// athlete remembers which school student it came from (schoolStudentId) so
// the same student is never imported twice.

let conn = null;
function schoolDb() {
  const uri = process.env.SCHOOL_MONGO_URI;
  if (!uri) return null;
  if (!conn) conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 });
  return conn;
}
async function collections() {
  const c = schoolDb();
  if (!c) {
    const err = new Error(
      "មិនទាន់ភ្ជាប់ database សាលា — ដាក់ SCHOOL_MONGO_URI ក្នុង backend/.env (យក MONGO_URI ពី school-management)"
    );
    err.status = 400;
    throw err;
  }
  try {
    await c.asPromise();
  } catch (e) {
    conn = null; // try again next time (e.g. after fixing the URI)
    c.close().catch(() => {});
    const err = new Error(`ភ្ជាប់ database សាលាមិនបាន: ${e.message}`);
    err.status = 502;
    throw err;
  }
  return {
    students: c.db.collection("students"),
    classes: c.db.collection("classes"),
    schools: c.db.collection("schools"),
  };
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameDay = (a, b) => a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// A school photo is either a full Cloudinary URL or a path on the school
// backend's own disk ("/uploads/…") — the latter needs SCHOOL_PUBLIC_URL.
function photoUrlOf(profileImage) {
  if (!profileImage) return null;
  if (/^https?:\/\//i.test(profileImage)) return profileImage;
  const base = (process.env.SCHOOL_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/${String(profileImage).replace(/^\/+/, "")}`;
}

function className(c) {
  if (!c) return "";
  return `${c.gradeLevel || ""}${c.nameKh || ""}`;
}

// GET /api/school-import/classes — every class (newest school year first).
exports.listClasses = async (req, res) => {
  try {
    const { classes, schools } = await collections();
    const [list, schoolList] = await Promise.all([
      classes.find({}, { projection: { gradeLevel: 1, nameKh: 1, academicYear: 1, school: 1 } }).toArray(),
      schools.find({}, { projection: { nameKh: 1 } }).toArray(),
    ]);
    const schoolName = new Map(schoolList.map((s) => [String(s._id), s.nameKh]));
    const multi = schoolList.length > 1;
    list.sort(
      (a, b) =>
        String(b.academicYear).localeCompare(String(a.academicYear)) ||
        Number(a.gradeLevel) - Number(b.gradeLevel) ||
        String(a.nameKh).localeCompare(String(b.nameKh))
    );
    res.json(
      list.map((c) => ({
        _id: String(c._id),
        name: className(c),
        academicYear: c.academicYear || "",
        school: multi ? schoolName.get(String(c.school)) || "" : "",
      }))
    );
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// GET /api/school-import/students?q=&classId=&all=1
// Students still studying (all=1 → every status), with an "already here" flag.
exports.listStudents = async (req, res) => {
  try {
    const { students, classes } = await collections();
    const filter = {};
    if (req.query.all !== "1") filter.studentStatus = { $in: ["studying", null] };
    if (req.query.classId) {
      try {
        filter.class = new mongoose.Types.ObjectId(String(req.query.classId));
      } catch {
        return res.status(400).json({ message: "Bad class id" });
      }
    }
    const q = String(req.query.q || "").trim();
    if (q) {
      const re = new RegExp(escapeRe(q), "i");
      filter.$or = [{ fullNameKh: re }, { fullNameLatin: re }, { studentId: re }];
    }
    if (!req.query.classId && !q) {
      return res.json({ rows: [], needFilter: true });
    }

    const list = await students
      .find(filter, {
        projection: {
          fullNameKh: 1,
          fullNameLatin: 1,
          gender: 1,
          dateOfBirth: 1,
          placeOfBirth: 1,
          address: 1,
          profileImage: 1,
          studentId: 1,
          class: 1,
        },
      })
      .sort({ fullNameKh: 1 })
      .limit(300)
      .toArray();

    const classIds = [...new Set(list.map((s) => s.class).filter(Boolean).map(String))];
    const classList = classIds.length
      ? await classes.find({ _id: { $in: classIds.map((id) => new mongoose.Types.ObjectId(id)) } }).toArray()
      : [];
    const classById = new Map(classList.map((c) => [String(c._id), c]));

    // already imported: linked by id, or same name + date of birth
    const ids = list.map((s) => String(s._id));
    const names = list.flatMap((s) => [s.fullNameKh, s.fullNameLatin].filter(Boolean));
    const existing = await Athlete.find({
      $or: [{ schoolStudentId: { $in: ids } }, { khmerName: { $in: names } }, { fullName: { $in: names } }],
    })
      .select("schoolStudentId fullName khmerName dateOfBirth assignments.team")
      .lean();

    const rows = list.map((s) => {
      const id = String(s._id);
      const match = existing.find(
        (a) =>
          a.schoolStudentId === id ||
          (sameDay(a.dateOfBirth, s.dateOfBirth) &&
            [a.khmerName, a.fullName].some((n) => n && (n === s.fullNameKh || n === s.fullNameLatin)))
      );
      return {
        _id: id,
        fullNameKh: s.fullNameKh || "",
        fullNameLatin: s.fullNameLatin || "",
        gender: s.gender || "",
        dateOfBirth: s.dateOfBirth || null,
        placeOfBirth: s.placeOfBirth || "",
        address: s.address || "",
        studentId: s.studentId || "",
        className: className(classById.get(String(s.class))),
        photoUrl: photoUrlOf(s.profileImage),
        existing: match ? { _id: match._id, teams: (match.assignments || []).map((x) => x.team) } : null,
      };
    });
    res.json({ rows, limited: list.length === 300 });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// Download a photo and store it in this app's Cloudinary (best effort — a
// student is still imported without a photo if this fails).
async function copyPhoto(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (!buffer.length) return null;
    return await uploadBufferToCloudinary(buffer, { folder: "athlete-verify/photos", resourceType: "image" });
  } catch {
    return null;
  }
}

// The school fields we copy, as they are in the school app right now.
function snapshotOf(s) {
  return {
    fullNameKh: s.fullNameKh || "",
    fullNameLatin: s.fullNameLatin || "",
    gender: s.gender || "",
    dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString() : "",
    placeOfBirth: s.placeOfBirth || "",
    address: s.address || "",
    profileImage: s.profileImage || "",
  };
}

// Copy onto `athlete` only what the SCHOOL changed since the last snapshot
// (no snapshot yet = take everything). Returns the list of changed fields.
async function applySchoolChanges(athlete, s) {
  const now = snapshotOf(s);
  const old = athlete.schoolSnapshot || {};
  const first = !athlete.schoolSnapshot;
  const changed = (k) => first || (old[k] ?? "") !== now[k];
  const fields = [];

  if (changed("fullNameKh") || changed("fullNameLatin")) {
    const fullName = now.fullNameLatin || now.fullNameKh;
    if (fullName && athlete.fullName !== fullName) {
      athlete.fullName = fullName;
      fields.push("fullName");
    }
    if (now.fullNameKh && athlete.khmerName !== now.fullNameKh) {
      athlete.khmerName = now.fullNameKh;
      fields.push("khmerName");
    }
  }
  if (changed("gender") && ["male", "female", "other"].includes(now.gender) && athlete.gender !== now.gender) {
    athlete.gender = now.gender;
    fields.push("gender");
  }
  if (changed("dateOfBirth") && now.dateOfBirth && !sameDay(athlete.dateOfBirth, now.dateOfBirth)) {
    athlete.dateOfBirth = new Date(now.dateOfBirth);
    fields.push("dateOfBirth");
  }
  if (changed("placeOfBirth") && athlete.placeOfBirth !== now.placeOfBirth) {
    athlete.placeOfBirth = now.placeOfBirth;
    fields.push("placeOfBirth");
  }
  if (changed("address") && now.address && athlete.address !== now.address) {
    athlete.address = now.address;
    fields.push("address");
  }
  // photo: only when the school photo itself changed (or none here yet)
  if (now.profileImage && (changed("profileImage") || !athlete.photoUrl) && (!first || !athlete.photoUrl)) {
    const photo = await copyPhoto(photoUrlOf(now.profileImage));
    if (photo) {
      athlete.photoUrl = photo.url;
      athlete.photoPublicId = photo.publicId;
      fields.push("photo");
    } else {
      now.profileImage = old.profileImage || ""; // try again next sync
    }
  }

  athlete.schoolSnapshot = now;
  athlete.markModified("schoolSnapshot");
  athlete.schoolSyncedAt = new Date();
  return fields;
}

// 🔄 Bring every imported athlete up to date with the school app. Used by
// the button (POST /api/school-import/sync) and the hourly timer in server.js.
async function syncAll() {
  const { students } = await collections();
  const athletes = await Athlete.find({ schoolStudentId: { $ne: null } });
  const out = { checked: athletes.length, updated: 0, missing: 0, failed: 0, changes: [] };
  if (!athletes.length) return out;

  const ids = [];
  for (const a of athletes) {
    try {
      ids.push(new mongoose.Types.ObjectId(a.schoolStudentId));
    } catch {
      /* not a valid id */
    }
  }
  const list = await students.find({ _id: { $in: ids } }).toArray();
  const byId = new Map(list.map((s) => [String(s._id), s]));

  for (const a of athletes) {
    const s = byId.get(a.schoolStudentId);
    if (!s) {
      out.missing += 1; // removed from the school app — leave the athlete alone
      continue;
    }
    try {
      const fields = await applySchoolChanges(a, s);
      await a.save();
      if (fields.length) {
        out.updated += 1;
        out.changes.push({ athleteId: a._id, name: a.khmerName || a.fullName, fields });
      }
    } catch (err) {
      out.failed += 1;
    }
  }
  return out;
}
exports.syncAll = syncAll;

// POST /api/school-import/sync — the 🔄 button.
exports.syncNow = async (req, res) => {
  try {
    res.json(await syncAll());
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// POST /api/school-import/import  { team, studentIds: [...] }
exports.importStudents = async (req, res) => {
  try {
    const team = String(req.body?.team || "").trim();
    const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String).slice(0, 100) : [];
    if (!team) return res.status(400).json({ message: "Team is required" });
    if (!ids.length) return res.status(400).json({ message: "ជ្រើសសិស្សយ៉ាងហោចណាស់ម្នាក់" });
    const Team = require("../models/Team");
    if (!(await Team.exists({ name: team }))) return res.status(404).json({ message: "Team not found" });

    const { students } = await collections();
    const objectIds = [];
    for (const id of ids) {
      try {
        objectIds.push(new mongoose.Types.ObjectId(id));
      } catch {
        /* skip bad id */
      }
    }
    const list = await students.find({ _id: { $in: objectIds } }).toArray();

    const results = [];
    for (const s of list) {
      const id = String(s._id);
      const name = s.fullNameKh || s.fullNameLatin || "";
      try {
        // already here? (linked, or same name + date of birth)
        const names = [s.fullNameKh, s.fullNameLatin].filter(Boolean);
        const candidates = await Athlete.find({
          $or: [{ schoolStudentId: id }, { khmerName: { $in: names } }, { fullName: { $in: names } }],
        });
        const found = candidates.find(
          (a) => a.schoolStudentId === id || (sameDay(a.dateOfBirth, s.dateOfBirth) && names.some((n) => n === a.khmerName || n === a.fullName))
        );
        if (found) {
          if (!found.schoolStudentId) found.schoolStudentId = id;
          if (!found.schoolSnapshot) {
            // already in ID before (typed by hand): link it, keep what's
            // here, and follow the school's changes from now on
            found.schoolSnapshot = snapshotOf(s);
            found.schoolSyncedAt = new Date();
          }
          let added = false;
          if (!found.assignments.some((x) => x.team === team)) {
            found.assignments.push({ team, role: "PLAYER", approvalStatus: "approved", everApproved: true });
            added = true;
          }
          await found.save();
          results.push({ studentId: id, name, result: added ? "addedToTeam" : "skipped", athleteId: found._id });
          continue;
        }

        const athlete = new Athlete({
          verifyId: await generateShortId(),
          fullName: s.fullNameLatin || s.fullNameKh,
          khmerName: s.fullNameKh || "",
          dateOfBirth: s.dateOfBirth || undefined,
          gender: ["male", "female", "other"].includes(s.gender) ? s.gender : undefined,
          address: s.address || "",
          placeOfBirth: s.placeOfBirth || "",
          schoolStudentId: id,
          schoolSnapshot: snapshotOf(s),
          schoolSyncedAt: new Date(),
          assignments: [{ team, role: "PLAYER", approvalStatus: "approved", everApproved: true }],
          createdBy: req.adminId,
        });
        const photo = await copyPhoto(photoUrlOf(s.profileImage));
        if (photo) {
          athlete.photoUrl = photo.url;
          athlete.photoPublicId = photo.publicId;
        }
        const qr = await generateAthleteQR(athlete.verifyId);
        athlete.qrCodeUrl = qr.url;
        athlete.qrCodePublicId = qr.publicId;
        await athlete.save();
        results.push({ studentId: id, name, result: "created", athleteId: athlete._id, photo: Boolean(photo) });
      } catch (err) {
        results.push({ studentId: id, name, result: "failed", message: err.message });
      }
    }

    const count = (k) => results.filter((r) => r.result === k).length;
    res.json({
      team,
      created: count("created"),
      addedToTeam: count("addedToTeam"),
      skipped: count("skipped"),
      failed: count("failed"),
      results,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};
