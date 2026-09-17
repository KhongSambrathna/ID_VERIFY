// Single source of truth for the four subscription plans — shared by the
// Team model's default, the Admin subscriptions page (payment recording +
// pricing), and the player-cap check on the athlete roster routes. Keeping
// it in one place means the price/cap numbers are never typed twice and
// can't drift out of sync between the backend check and what the Admin UI
// shows.
//
// Pricing follows one simple rule across every plan: paying for 6 months
// costs 75% of the monthly rate per month, and paying for a full year costs
// 50% of the monthly rate per month — the same discount ladder Pro was
// specified with, just applied consistently up and down the plan list.
const PLANS = {
  BASIC: { maxPlayers: 20, monthlyRate: 1 },
  PRO: { maxPlayers: 40, monthlyRate: 2 },
  PRO_MAX: { maxPlayers: 80, monthlyRate: 4 },
  // No player cap at all — for a big academy running several age-group
  // squads under one team entry.
  UNLIMITED: { maxPlayers: null, monthlyRate: 8 },
};

const PLAN_ORDER = ["BASIC", "PRO", "PRO_MAX", "UNLIMITED"];

// billingCycle -> how many months one payment covers, and the discount
// multiplier applied to the plan's monthlyRate for that cycle.
const BILLING_CYCLES = {
  MONTHLY: { months: 1, rateMultiplier: 1 },
  HALF_YEAR: { months: 6, rateMultiplier: 0.75 },
  YEARLY: { months: 12, rateMultiplier: 0.5 },
};

function planInfo(planKey) {
  return PLANS[planKey] || PLANS.BASIC;
}

// The per-month rate a team actually pays for one billing cycle of a plan,
// e.g. priceFor("PRO", "YEARLY") === 1 (their $1/month-if-paid-yearly rate).
function priceFor(planKey, billingCycle) {
  const plan = planInfo(planKey);
  const cycle = BILLING_CYCLES[billingCycle] || BILLING_CYCLES.MONTHLY;
  return Math.round(plan.monthlyRate * cycle.rateMultiplier * 100) / 100;
}

// Total amount due for one payment of that plan/cycle (per-month rate * how
// many months the cycle covers) — what recordSubscriptionPayment defaults
// `amount` to unless the Admin overrides it.
function totalFor(planKey, billingCycle) {
  const cycle = BILLING_CYCLES[billingCycle] || BILLING_CYCLES.MONTHLY;
  return Math.round(priceFor(planKey, billingCycle) * cycle.months * 100) / 100;
}

function monthsFor(billingCycle) {
  return (BILLING_CYCLES[billingCycle] || BILLING_CYCLES.MONTHLY).months;
}

// How many PLAYER-role assignments already exist on this team — pending
// approval and pending removal both still count (they're occupying a roster
// slot until actually resolved), so a team can't dodge its cap by stacking
// up unapproved additions.
async function countTeamPlayers(Athlete, team) {
  const rows = await Athlete.aggregate([
    { $unwind: "$assignments" },
    { $match: { "assignments.team": team, "assignments.role": "PLAYER" } },
    { $count: "n" },
  ]);
  return rows[0]?.n || 0;
}

module.exports = { PLANS, PLAN_ORDER, BILLING_CYCLES, planInfo, priceFor, totalFor, monthsFor, countTeamPlayers };
