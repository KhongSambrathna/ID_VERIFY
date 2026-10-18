const RegistrationInvite = require("../models/RegistrationInvite");
const Athlete = require("../models/Athlete");
const Team = require("../models/Team");
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

// Load the invite a public token points at and check it can still be used.
// Returns { invite } or { error: { status, message } } so every public route
// shares one definition of "this link is dead" instead of re-deriving it.
// The message tells the player WHICH way the link is dead (used/full,
// revoked, expired) so the form can say something useful.
async function loadUsableInvite(token) {
  const invite = await RegistrationInvite.findOne({ token });
  if (!invite) {
    return { error: { status: 404, message: "This registration link is not valid" } };
  }
  if (invite.status === "revoked") {
    return { error: { status: 404, message: "This registration link has been revoked" } };
  }
  if (invite.status !== "active") {
    return { error: { status: 404, message: "This registration link has already been used" } };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return { error: { status: 404, message: "This registration link has expired" } };
  }
  // A capped shared link whose spots are all taken is effectively "used".
  if (invite.usesLeft() === 0) {
    return { error: { status: 404, message: "This registration link has already been used" } };
  }
  return { invite };
}

// Record that one more player registered through this link: bump the counter,
// append them to the log the coach's list reads, and — for a capped link —
// flip to "used" once it's full. An unlimited link simply stays active.
function consumeInviteUse(invite, athleteId) {
  invite.useCount = (invite.useCount || 0) + 1;
  invite.registrations.push({ athleteId, createdAt: new Date() });
  // Keep the legacy single-name field pointing at the first registrant so
  // older clients (and the one-player link UX) still show a name.
  if (!invite.athleteId) invite.athleteId = athleteId;
  if (invite.usesLeft() === 0) invite.status = "used";
}

// POST /api/registration/invites  (Head Coach own team; Admin any team) —
// create a self-registration link for the coach's team. Returns the invite
// including its `token`; the frontend builds the shareable URL from it
// (…/register/<token>) and the coach sends that to players.
//
// `maxUses` in the body decides how many players the link serves:
//   omitted / 1  — one player (the original single-use link).
//   null         — unlimited: one link for the whole squad (share it in the
//                  team group chat; everyone who opens it can register).
//   N            — exactly N players, then it stops working.
exports.createInvite = async (req, res) => {
  try {
    const team = resolveTeam(req);
    if (!team) {
      return res.status(400).json({ message: "Team is required to create a registration link" });
    }
    // The link must point at an EXISTING team — an Admin picks from teams
    // already registered in the club. They can't invent a new team name
    // through a registration link (teams are managed separately by Admin).
    const teamExists = await Team.findOne({ name: team });
    if (!teamExists) {
      return res
        .status(400)
        .json({ message: `Team "${team}" doesn't exist. Create the team first, or pick an existing team.` });
    }

    const role = ["PLAYER", "ASSISTAN COACH", "HEAD COACH", "TECHNICAL", "MEDIC"].includes(req.body.role)
      ? req.body.role
      : "PLAYER";

    // null (JSON null) = unlimited; a positive integer = that many players;
    // anything else (missing, garbage, < 1) falls back to the single-use link.
    let maxUses = 1;
    if (req.body.maxUses === null) maxUses = null;
    else if (req.body.maxUses !== undefined) {
      const n = Number.parseInt(req.body.maxUses, 10);
      if (Number.isFinite(n) && n >= 1) maxUses = n;
    }

    const invite = await RegistrationInvite.create({
      token: RegistrationInvite.generateToken(),
      team,
      role,
      maxUses,
      createdBy: req.adminId,
    });

    res.status(201).json(invite);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/registration/invites  (Head Coach own team; Admin any/?team=) —
// every invite this coach has sent, newest first, with everyone who
// registered through each one. For a shared (multi-use) link that means the
// full list of players it signed up, plus "X of Y used" so the coach can see
// at a glance how many spots a link has left. Doubles as a "who signed up
// through which link" view.
exports.listInvites = async (req, res) => {
  try {
    const filter = req.adminRole === "HEAD_COACH" ? { team: req.adminTeam } : {};
    if (req.adminRole === "ADMIN" && req.query.team) filter.team = req.query.team;

    const invites = await RegistrationInvite.find(filter)
      .populate("registrations.athleteId", "fullName khmerName")
      // Still populated for links created before multi-use existed, whose
      // only registrant lives in the legacy athleteId field.
      .populate("athleteId", "fullName khmerName")
      .sort({ createdAt: -1 });

    const result = invites.map((inv) => {
      // Everyone who registered through this link — from the registrations
      // log, falling back to the legacy single athleteId for old links.
      const players = (inv.registrations || [])
        .filter((r) => r.athleteId)
        .map((r) => ({
          _id: r.athleteId._id,
          fullName: r.athleteId.fullName || "",
          khmerName: r.athleteId.khmerName || "",
          createdAt: r.createdAt,
        }));
      if (players.length === 0 && inv.athleteId) {
        players.push({
          _id: inv.athleteId._id,
          fullName: inv.athleteId.fullName || "",
          khmerName: inv.athleteId.khmerName || "",
          createdAt: inv.updatedAt,
        });
      }

      return {
        _id: inv._id,
        token: inv.token,
        team: inv.team,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        // null = unlimited link; otherwise the cap this link was created with.
        maxUses: inv.maxUses === null || inv.maxUses === undefined ? null : inv.maxUses,
        useCount: inv.useCount || 0,
        // null = unlimited; otherwise spots still open on this link.
        usesLeft: inv.usesLeft(),
        players,
        // Legacy single-name fields, kept so existing UI/consumers don't break.
        fullName: players[0]?.fullName || "",
        khmerName: players[0]?.khmerName || "",
      };
    });
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
// token is a clean 404 so the form never renders for a dead link. Also returns
// the link's remaining spots so the form can say "unlimited" / "N left".
exports.getInviteByToken = async (req, res) => {
  try {
    const { invite, error } = await loadUsableInvite(req.params.token);
    if (error) return res.status(error.status).json({ message: error.message });
    res.json({ team: invite.team, role: invite.role, usesLeft: invite.usesLeft() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/registration/invites/:token  (PUBLIC — no login, multipart:
// photo, documents[]) — the player fills in their OWN details and submits.
// Creates a brand-new Athlete whose first assignment is "pending" (hidden
// from public search/verify until an Admin approves), generates their ID/QR,
// counts one use against the link, and returns the ID + default password so
// the success screen can tell the player exactly what to write down. The
// login itself is NOT created here — that happens on Admin approval (see
// utils/playerAccount.js), so an unapproved registration grants no access.
//
// Multi-use: a shared (unlimited) link is NOT consumed — it stays active so
// the next teammate can register through the same URL. Only a capped link
// flips to "used" once its last spot is taken.
exports.registerViaInvite = async (req, res) => {
  try {
    const { invite, error } = await loadUsableInvite(req.params.token);
    if (error) return res.status(error.status).json({ message: error.message });

    const { fullName, khmerName, dateOfBirth, gender, address, isAvailable } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: "Full name is required" });
    }

    const team = invite.team;
    const role = invite.role || "PLAYER";

    // If this name already belongs to an APPROVED athlete on ANOTHER team,
    // don't silently create a second profile — skip the auto-creation and
    // require an explicit confirmation first. The player either claims the
    // existing person ("this is me, add me to this team") or confirms they're
    // a different person and registers as new anyway (confirmDuplicate=true).
    if (req.body.confirmDuplicate !== true && req.body.confirmDuplicate !== "true") {
      const nameEscaped = fullName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const candidates = await Athlete.find({
        fullName: new RegExp(`^${nameEscaped}$`, "i"),
      })
        .select("fullName khmerName verifyId photoUrl assignments")
        .lean();

      const existingOnOtherTeam = candidates.filter((a) =>
        (a.assignments || []).some(
          (asg) => asg.approvalStatus === "approved" && String(asg.team) !== team
        )
      );

      if (existingOnOtherTeam.length > 0) {
        return res.status(409).json({
          code: "DUPLICATE_IN_OTHER_TEAM",
          message: `The name "${fullName}" is already registered on another team. Confirm to proceed.`,
          existing: existingOnOtherTeam.map((a) => ({
            _id: a._id,
            fullName: a.fullName,
            khmerName: a.khmerName,
            verifyId: a.verifyId,
            photoUrl: a.photoUrl,
          })),
        });
      }
    }

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

    // Count this registration against the link. A shared (unlimited) link
    // stays active for the next teammate; a capped one flips to "used" once
    // its last spot is taken, so the same URL can't overrun the limit.
    consumeInviteUse(invite, athlete._id);
    await invite.save();

    notifyAdmins(`🆕 ${athlete.fullName} self-registered for ${team} — needs approval.`);

    // The ID + default password are what the player writes down now. The
    // account is only created once an Admin approves, at which point they can
    // sign in with these and will be forced to set their own password.
    // `usesLeft` lets the success screen offer "register another player" when
    // the link still has spots.
    res.status(201).json({
      message: "Registration submitted — pending admin approval",
      verifyId: athlete.verifyId,
      defaultPassword: DEFAULT_PLAYER_PASSWORD,
      fullName: athlete.fullName,
      photoUrl: athlete.photoUrl || null,
      team,
      role,
      usesLeft: invite.usesLeft(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/registration/invites/:token/check-duplicate?fullName=...  (PUBLIC
// — no login, but gated by a valid invite token) — the self-registration
// form's "is this person already in the system?" search, so someone who's
// already on another team can join this one too instead of creating a
// duplicate profile. ENGLISH NAME ONLY, "same or similar" substring match —
// identical rules to the staff check-duplicate above. Because this is
// reachable by anyone holding the link, it only ever returns athletes who
// already have at least one APPROVED assignment (i.e. are public on the
// verify/search pages) — a purely-pending person is never exposed here.
exports.checkDuplicate = async (req, res) => {
  try {
    const { error } = await loadUsableInvite(req.params.token);
    if (error) return res.status(error.status).json({ message: error.message });

    const fullName = (req.query.fullName || "").trim();
    if (fullName.length < 2) return res.json({ duplicates: [] });

    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicates = await Athlete.find({
      // Only already-public people are ever surfaced to an unauthenticated
      // caller holding the link.
      "assignments.approvalStatus": "approved",
      fullName: new RegExp(escape(fullName), "i"),
    })
      .select("fullName khmerName assignments verifyId photoUrl")
      .limit(8);

    res.json({ duplicates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/registration/invites/:token/claim/:athleteId  (PUBLIC — no login,
// gated by a valid invite token) — the "this is me, add me to this team"
// action. Attaches the invite's team/role to an EXISTING athlete (same
// profile, photo, ID, QR — nothing duplicated) as a PENDING assignment,
// exactly like a Head Coach adding an assignment: hidden from public
// search/verify until an Admin approves it, at which point their login is
// auto-provisioned if they don't have one yet. Counts one use of the link
// (a shared link stays open; a capped one closes when full) and returns the
// same { verifyId, defaultPassword, ... } shape as a fresh registration, so
// the success screen is identical either way.
exports.claimExisting = async (req, res) => {
  try {
    const { invite, error } = await loadUsableInvite(req.params.token);
    if (error) return res.status(error.status).json({ message: error.message });

    const athlete = await Athlete.findById(req.params.athleteId);
    if (!athlete) return res.status(404).json({ message: "Player not found" });
    // Only an already-public person can be claimed this way — keeps this
    // endpoint consistent with what checkDuplicate above is willing to show.
    if (!athlete.assignments.some((a) => a.approvalStatus === "approved")) {
      return res.status(400).json({ message: "That player can't be matched right now" });
    }

    const team = invite.team;
    const role = invite.role || "PLAYER";

    if (athlete.assignments.some((a) => a.team === team && a.role === role)) {
      return res.status(400).json({ message: `They're already on ${team} as ${role}` });
    }

    const capError = await checkPlayerCap(team, role);
    if (capError) return res.status(400).json({ message: capError });

    athlete.assignments.push({ team, role, approvalStatus: "pending", everApproved: false });
    await athlete.save();

    // Count this claim against the link instead of burning it — a shared
    // link stays usable for the next teammate; a capped one closes when full.
    consumeInviteUse(invite, athlete._id);
    await invite.save();

    notifyAdmins(`🆕 ${athlete.fullName} joined ${team} via a registration link — needs approval.`);

    res.status(201).json({
      message: "Joined team — pending admin approval",
      verifyId: athlete.verifyId,
      defaultPassword: DEFAULT_PLAYER_PASSWORD,
      fullName: athlete.fullName,
      photoUrl: athlete.photoUrl || null,
      team,
      role,
      usesLeft: invite.usesLeft(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/registration/stats  (ADMIN) — comprehensive registration/link data
// for the admin dashboard: invite counts, registration counts, pending
// approvals, a per-team breakdown, and the most recent sign-ups.
exports.getStats = async (req, res) => {
  try {
    const totalInvites = await RegistrationInvite.countDocuments({});
    const activeInvites = await RegistrationInvite.countDocuments({ status: "active" });
    const usedInvites = await RegistrationInvite.countDocuments({ status: "used" });
    const revokedInvites = await RegistrationInvite.countDocuments({ status: "revoked" });

    const regAgg = await RegistrationInvite.aggregate([
      { $group: { _id: null, total: { $sum: "$useCount" } } },
    ]);
    const totalRegistrations = (regAgg[0] && regAgg[0].total) || 0;

    const pendingApprovals = await Athlete.countDocuments({
      "assignments.approvalStatus": "pending",
    });

    const teams = await Team.find().sort({ name: 1 }).select("name");
    const perTeam = await Promise.all(
      teams.map(async (t) => {
        const total = await Athlete.countDocuments({ "assignments.team": t.name });
        const pending = await Athlete.countDocuments({
          "assignments.team": t.name,
          "assignments.approvalStatus": "pending",
        });
        const approved = await Athlete.countDocuments({
          "assignments.team": t.name,
          "assignments.approvalStatus": "approved",
        });
        return { team: t.name, total, pending, approved };
      })
    );

    const recentRegistrations = await RegistrationInvite.find({
      "registrations.0": { $exists: true },
    })
      .populate("registrations.athleteId", "fullName khmerName")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      totalInvites,
      activeInvites,
      usedInvites,
      revokedInvites,
      totalRegistrations,
      pendingApprovals,
      perTeam,
      recentRegistrations,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

