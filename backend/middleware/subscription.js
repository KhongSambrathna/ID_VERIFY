const Team = require("../models/Team");

// Gates a Head Coach's management actions (squad lists, formations,
// starting XI, adding/editing athletes) behind their team's plan
// subscription (Basic/Pro/Pro Max/Unlimited). Payment is recorded by hand
// by an Admin (see
// teamController.recordSubscriptionPayment) — there is no in-app payment
// gateway — so this middleware only ever *reads* Team.subscriptionExpiresAt.
//
// Admin accounts always pass straight through: they're the ones who record
// payments in the first place, and a Head Coach account being unpaid must
// never lock the Admin out of that same team's tools. A Player account
// never reaches routes this middleware is attached to.
async function requireActiveSubscription(req, res, next) {
  if (req.adminRole !== "HEAD_COACH") return next();

  try {
    const team = await Team.findOne({ name: req.adminTeam });
    const active = !!(team && team.subscriptionExpiresAt && team.subscriptionExpiresAt.getTime() > Date.now());
    if (!active) {
      return res.status(402).json({
        code: "SUBSCRIPTION_EXPIRED",
        message: "Your team's plan subscription has expired. Please contact your Admin to renew it.",
        expiresAt: team?.subscriptionExpiresAt || null,
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { requireActiveSubscription };
