const RegistrationInvite = require("../models/RegistrationInvite");
const Athlete = require("../models/Athlete");
const generateShortId = require("../utils/generateShortId");
const generateAthleteQR = require("../utils/generateQR");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const { notifyAdmins } = require("../utils/notify");
const { DEFAULT_PLAYER_PASSWORD } = require("../utils/playerAccount");
// Reuse the exact same per-team player-cap rule the normal add-athlete route
// enforces, so a self-registration can't sneak past a team's plan limit.
const { checkPlayerCap } = require("./athleteController");

// Resolve which team an invite targets. A Head Coach is always forced to
// their OWN team (req.adminTeam) — the team is never trusted from the request
// body for them, so a coach can't create invites for another team. An Admin
// may pick any team explicitly, same as adding an athlete directly.
function resolveTeam(req) {
  return req.adminRole === "ADMIN" ? (req.body.team || "").trim() : req.adminTeam;
}

// Whether this account may act on an invite that targets `team`.
function canAccessTeam(req, team) {
  return req.adminRole === "ADMIN" || team === req.adminTeam;
}

// POST /api/registration/invites  (Head Coach own team; Admin any team) —
// create a fresh single-use self-registration link for the coach's team.
// Returns the invite including its `token`; the frontend builds the shareable
// URL from it (…/register/<token>) and the coach sends that to a player.
exports.createInvite = async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) {
      return res.status(400).json({ message: "Team is required to create a registration link" });
    }

    const role = ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"].includes(req.body.role)
      ? req.body.role
      : "PLAYER";

    const invite = await RegistrationInvite.create({
      token: RegistrationInvite.generateToken(),
      team,
      role,
      createdBy: req.adminId,
    });

    res.status(201).json(invite);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/registration/invites  (Head Coach own team; Admin any/?team=) —
// every invite this coach has sent, newest first, with the linked athlete's
// name filled in for any that have already been used, so the list doubles as
// a "who signed up through which link" view.
exports.listInvites = async (req, res) => {
  try {
    const filter = req.adminRole === "HEAD_COACH" ? { team: req.adminTeam } : {};
    if (req.adminRole === "ADMIN" && req.query.team) filter.team = req.query.team;

    const invites = await RegistrationInvite.find(filter)
      .populate("athleteId", "fullName khmerName")
      .sort({ createdAt: -1 });

    const result = invites.map((inv) => ({
      _id: inv._id,
      token: inv.token,
      team: inv.team,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      fullName: inv.athleteId?.fullName || "",
      khmerName: inv.athleteId?.khmerName || "",
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/registration/invites/:id  (Head Coach own team; Admin any) —
// cancel a link before anyone uses it. Only an "active" invite can be
// revoked; a used/revoked one is left as-is (its history is already settled).
exports.revokeInvite = async (req, res) => {
  try {
    const invite = await RegistrationInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ message: "Registration link not found" });
    if (!canAccessTeam(req, invite.team)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (invite.status !== "active") {
      return res.status(400).json({ message: "This link has already been used or revoked" });
    }
    invite.status = "revoked";
    await invite.save();
    res.json(invite);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/registration/invites/:token  (PUBLIC — no login) — validate a
// shared link before rendering the registration form. Returns just enough to
// show the player which team they're joining; a used/revoked/expired/unknown
// token is a clean 404 so the form never renders for a dead link.
exports.getInviteByToken = async (req, res) => {
  try {
    const invite = await RegistrationInvite.findOne({ token: req.params.token });
    if (!invite) return res.status(404).json({ message: "This registration link is not valid" });
    if (invite.status !== "active") {
      return res.status(404).json({ message: "This registration link has already been used" });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return res.status(404).json({ message: "This registration link has expired" });
    }
    res.json({ team: invite.team, role: invite.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/registration/invites/:token  (PUBLIC — no login, multipart:
// photo, documents[]) — the player fills in their OWN details and submits.
// Creates a brand-new Athlete whose first assignment is "pending" (hidden
// from public search/verify until an Admin approves), generates their ID/QR,
// burns the invite (single-use), and returns the ID + default password so the
// success screen can tell the player exactly what to write down. The login
// itself is NOT created here — that happens on Admin approval (see
// utils/playerAccount.js), so an unapproved registration grants no access.
exports.registerViaInvite = async (req, res) => {
  try {
    const invite = await RegistrationInvite.findOne({ token: req.params.token });
    if (!invite) return res.status(404).json({ message: "This registration link is not valid" });
    if (invite.status !== "active") {
      return res.status(404).json({ message: "This registration link has already been used" });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return res.status(404).json({ message: "This registration link has expired" });
    }

    const { fullName, khmerName, dateOfBirth, gender, address, isAvailable } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "Full name is required" });
    }

    const team = invite.team;
    const role = invite.role || "PLAYER";

    const capError = await checkPlayerCap(team, role);
    if (capError) return res.status(400).json({ message: capError });

    const verifyId = await generateShortId();

    const athlete = new Athlete({
      verifyId,
      fullName: fullName.trim(),
      khmerName: khmerName ? khmerName.trim() : undefined,
      dateOfBirth,
      gender,
      address,
      // A self-registration is ALWAYS pending — it needs an Admin to confirm
      // the person's identity/documents before it's public, same as an
      // assignment a Head Coach adds directly.
      assignments: [{ team, role, approvalStatus: "pending", everApproved: false }],
      isAvailable: isAvailable === "false" ? false : true,
      // Ties the record back to the coach who sent the invite.
      createdBy: invite.createdBy,
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

    const qr = await generateAthleteQR(athlete.verifyId);
    athlete.qrCodeUrl = qr.url;
    athlete.qrCodePublicId = qr.publicId;

    await athlete.save();

    // Burn the link — it's single-use, so the same shared URL can't be used
    // to register a second player.
    invite.status = "used";
    invite.athleteId = athlete._id;
    await invite.save();

    notifyAdmins(`🆕 ${athlete.fullName} self-registered for ${team} — needs approval.`);

    // The ID + default password are what the player writes down now. The
    // account is only created once an Admin approves, at which point they can
    // sign in with these and will be forced to set their own password.
    res.status(201).json({
      message: "Registration submitted — pending admin approval",
      verifyId: athlete.verifyId,
      defaultPassword: DEFAULT_PLAYER_PASSWORD,
      fullName: athlete.fullName,
      team,
      role,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

