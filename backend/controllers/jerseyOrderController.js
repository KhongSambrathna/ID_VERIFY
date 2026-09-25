const Team = require("../models/Team");
const Athlete = require("../models/Athlete");
const { notifyAdmins, notifyTeamCoaches } = require("../utils/notify");

// Every handler below comes in a "mine" flavor (Head Coach/Player acting on
// THEIR OWN team, taken from the verified JWT's req.adminTeam — never a
// client-supplied id, same reasoning as teamController's getMyKhqr/
// getMyLogo) and an admin flavor (any team, by Team._id — same :id-param
// shape as the rest of teamRoutes.js's admin-only section). Both flavors
// share the same internal logic below; only how `team` is resolved differs.

async function resolveMyTeam(req, res) {
  const team = await Team.findOne({ name: req.adminTeam });
  if (!team) {
    res.status(404).json({ message: "Your team was not found" });
    return null;
  }
  return team;
}

async function resolveTeamById(req, res) {
  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404).json({ message: "Team not found" });
    return null;
  }
  return team;
}

// Public shape of one jerseyOrder subdocument for API responses.
function shapeOrder(o) {
  return {
    _id: o._id,
    athlete: o.athlete,
    fullName: o.fullName,
    photoUrl: o.photoUrl,
    jerseyName: o.jerseyName,
    jerseyNumber: o.jerseyNumber,
    registeredBy: o.registeredBy,
    feePaidAmount: o.feePaidAmount,
    feePaid: o.feePaid,
    pendingRemoval: o.pendingRemoval,
    createdAt: o.createdAt,
  };
}

function shapeTeamOrders(team) {
  return {
    team: team.name,
    orders: team.jerseyOrders
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(shapeOrder),
  };
}

// ---- list ----------------------------------------------------------------

exports.listMyJerseyOrders = async (req, res) => {
  try {
    const team = await resolveMyTeam(req, res);
    if (!team) return;
    res.json(shapeTeamOrders(team));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listTeamJerseyOrders = async (req, res) => {
  try {
    const team = await resolveTeamById(req, res);
    if (!team) return;
    res.json(shapeTeamOrders(team));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---- register (self) ------------------------------------------------------

// POST /api/teams/mine/jersey-orders  (individual Player login only —
// self-service; req.athleteId comes from that account's token, same
// pattern as tournamentController.registerSelf)
exports.registerMyJerseyOrder = async (req, res) => {
  try {
    if (!req.athleteId) {
      return res.status(403).json({
        message:
          "Only an individual player login can order a jersey for themselves — ask your Head Coach to register you instead.",
      });
    }
    const team = await resolveMyTeam(req, res);
    if (!team) return;

    const athlete = await Athlete.findById(req.athleteId);
    if (!athlete) return res.status(404).json({ message: "Athlete not found" });
    const assignment = athlete.assignments.find((a) => a.team === team.name);
    if (!assignment) return res.status(403).json({ message: "You're not on this team" });

    if (team.jerseyOrders.some((o) => String(o.athlete) === String(athlete._id))) {
      return res.status(409).json({ message: "You've already registered a jersey order — edit it instead." });
    }

    const { jerseyName, jerseyNumber } = req.body;
    const name = (jerseyName || "").trim();
    const number = Number(jerseyNumber);
    if (!name) return res.status(400).json({ message: "A jersey name is required" });
    if (!Number.isFinite(number) || number < 0 || number > 99) {
      return res.status(400).json({ message: "Jersey number must be between 0 and 99" });
    }

    team.jerseyOrders.push({
      athlete: athlete._id,
      fullName: athlete.fullName,
      photoUrl: athlete.photoUrl || null,
      jerseyName: name,
      jerseyNumber: number,
      registeredBy: null,
    });
    await team.save();
    res.status(201).json(shapeTeamOrders(team));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---- register (on behalf) --------------------------------------------------

// POST .../jersey-orders/register-admin  (Head Coach, own team via "mine";
// Admin, any team via :id) — body: { athleteId, jerseyName, jerseyNumber }.
async function registerOnBehalf(req, res, team) {
  const { athleteId, jerseyName, jerseyNumber } = req.body;
  const athlete = await Athlete.findById(athleteId);
  if (!athlete) return res.status(404).json({ message: "Athlete not found" });
  const assignment = athlete.assignments.find((a) => a.team === team.name);
  if (!assignment) return res.status(403).json({ message: "That athlete isn't on this team" });

  if (team.jerseyOrders.some((o) => String(o.athlete) === String(athlete._id))) {
    return res.status(409).json({ message: "This athlete already has a jersey order — edit it instead." });
  }

  const name = (jerseyName || "").trim();
  const number = Number(jerseyNumber);
  if (!name) return res.status(400).json({ message: "A jersey name is required" });
  if (!Number.isFinite(number) || number < 0 || number > 99) {
    return res.status(400).json({ message: "Jersey number must be between 0 and 99" });
  }

  team.jerseyOrders.push({
    athlete: athlete._id,
    fullName: athlete.fullName,
    photoUrl: athlete.photoUrl || null,
    jerseyName: name,
    jerseyNumber: number,
    registeredBy: req.adminId,
  });
  await team.save();
  res.status(201).json(shapeTeamOrders(team));
}

exports.registerJerseyOrderOnBehalfMine = async (req, res) => {
  try {
    const team = await resolveMyTeam(req, res);
    if (!team) return;
    await registerOnBehalf(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.registerJerseyOrderOnBehalfAdmin = async (req, res) => {
  try {
    const team = await resolveTeamById(req, res);
    if (!team) return;
    await registerOnBehalf(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---- edit (name/number) -----------------------------------------------------

// PATCH .../jersey-orders/:orderId — free to edit any time (name/number
// never gates approval, same reasoning as Athlete.assignments.jerseyNumber
// being pure squad-list bookkeeping). A Player may only edit their OWN
// order; Head Coach/Admin may edit any order on the team they're scoped to.
async function updateOrder(req, res, team) {
  const order = team.jerseyOrders.id(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Jersey order not found" });

  const isOwnRow = req.adminRole === "PLAYER" && req.athleteId && String(order.athlete) === String(req.athleteId);
  const isStaff = req.adminRole === "HEAD_COACH" || req.adminRole === "ADMIN";
  if (!isOwnRow && !isStaff) return res.status(403).json({ message: "Access denied" });

  const { jerseyName, jerseyNumber } = req.body;
  if (jerseyName !== undefined) {
    const name = (jerseyName || "").trim();
    if (!name) return res.status(400).json({ message: "A jersey name is required" });
    order.jerseyName = name;
  }
  if (jerseyNumber !== undefined) {
    const number = Number(jerseyNumber);
    if (!Number.isFinite(number) || number < 0 || number > 99) {
      return res.status(400).json({ message: "Jersey number must be between 0 and 99" });
    }
    order.jerseyNumber = number;
  }
  await team.save();
  res.json(shapeTeamOrders(team));
}

exports.updateMyTeamJerseyOrder = async (req, res) => {
  try {
    const team = await resolveMyTeam(req, res);
    if (!team) return;
    await updateOrder(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateTeamJerseyOrderAdmin = async (req, res) => {
  try {
    const team = await resolveTeamById(req, res);
    if (!team) return;
    await updateOrder(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---- payment status ----------------------------------------------------------

// PATCH .../jersey-orders/:orderId/paid  (Admin, or Head Coach for their own
// team) — body: { amount, paid }. `amount` is the cash amount collected so
// far, a simple note same as Tournament registrations' feePaidAmount;
// `paid` is a plain yes/no staff sets themselves once it's fully settled —
// there's no single fixed jersey price configured anywhere in this app the
// way a tournament has an entryFee, so this is a manual flag rather than a
// computed amount-vs-price comparison.
async function setPaid(req, res, team) {
  const order = team.jerseyOrders.id(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Jersey order not found" });

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }
  order.feePaidAmount = amount;
  order.feePaid = !!req.body.paid;
  const settled = amount > 0 || order.feePaid;
  order.feePaidAt = settled ? new Date() : null;
  order.feePaidBy = settled ? req.adminId : null;
  await team.save();
  res.json(shapeTeamOrders(team));
}

exports.setMyTeamJerseyOrderPaid = async (req, res) => {
  try {
    const team = await resolveMyTeam(req, res);
    if (!team) return;
    await setPaid(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setTeamJerseyOrderPaidAdmin = async (req, res) => {
  try {
    const team = await resolveTeamById(req, res);
    if (!team) return;
    await setPaid(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---- remove / confirm removal ------------------------------------------------

// DELETE .../jersey-orders/:orderId — Admin/Head Coach removes any order
// immediately, same as always. A PLAYER hitting this on their OWN row is
// different: it doesn't remove it outright, it just flags the row
// pendingRemoval and leaves it in place — actually taking it off needs an
// Admin/Head Coach to call this same endpoint themselves (confirming it),
// or PATCH .../keep to decline it and clear the flag instead (see
// keepOrder below). Same approval-gate pattern as Athlete.assignments'
// pendingRemoval and Tournament.registrationSchema's pendingRemoval.
async function removeOrder(req, res, team) {
  const order = team.jerseyOrders.id(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Jersey order not found" });

  const isOwnRow = req.adminRole === "PLAYER" && req.athleteId && String(order.athlete) === String(req.athleteId);
  const isStaff = req.adminRole === "HEAD_COACH" || req.adminRole === "ADMIN";
  if (!isOwnRow && !isStaff) return res.status(403).json({ message: "Access denied" });

  if (isOwnRow && !isStaff) {
    if (order.pendingRemoval) return res.json(shapeTeamOrders(team)); // already requested — no-op
    order.pendingRemoval = true;
    await team.save();
    const text = `👕 ${order.fullName} asked to cancel their jersey order (#${order.jerseyNumber} "${order.jerseyName}") on ${team.name} — needs Admin/Head Coach confirmation.`;
    notifyAdmins(text);
    notifyTeamCoaches(team.name, text);
    return res.json(shapeTeamOrders(team));
  }

  order.deleteOne();
  await team.save();
  res.json(shapeTeamOrders(team));
}

exports.removeMyTeamJerseyOrder = async (req, res) => {
  try {
    const team = await resolveMyTeam(req, res);
    if (!team) return;
    await removeOrder(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeTeamJerseyOrderAdmin = async (req, res) => {
  try {
    const team = await resolveTeamById(req, res);
    if (!team) return;
    await removeOrder(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH .../jersey-orders/:orderId/keep  (Admin, or Head Coach for their own
// team) — declines a player's own pending cancellation request: clears
// pendingRemoval and leaves the order exactly as it was, same "keep" idea
// as the assignment-removal and tournament-withdrawal decline paths.
async function keepOrder(req, res, team) {
  const order = team.jerseyOrders.id(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Jersey order not found" });
  order.pendingRemoval = false;
  await team.save();
  notifyTeamCoaches(
    team.name,
    `↩️ ${order.fullName}'s jersey order cancellation on ${team.name} was declined — it stays as-is.`
  );
  res.json(shapeTeamOrders(team));
}

exports.keepMyTeamJerseyOrder = async (req, res) => {
  try {
    const team = await resolveMyTeam(req, res);
    if (!team) return;
    await keepOrder(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.keepTeamJerseyOrderAdmin = async (req, res) => {
  try {
    const team = await resolveTeamById(req, res);
    if (!team) return;
    await keepOrder(req, res, team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
