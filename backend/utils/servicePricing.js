// Pricing for the two extra club services (Referee, Trophy/Award setup)
// shown on the public Pricing page alongside the team subscription plans
// (see subscriptionPlans.js for those). Unlike subscription plans, these
// aren't enforced or billed anywhere in the app — they're informational
// only, and payment/booking is arranged with the Admin outside the app
// (Telegram, phone, etc.), the same way Shop orders are. There is no
// self-serve editor for these numbers yet: an Admin gives the real figures
// to whoever maintains the code, and they're filled in here. `null` means
// "not set yet" — the Pricing page shows a "contact Admin" placeholder
// instead of a price for any field left null.

// Referee service — a flat per-match base fee, plus optional extra charges
// for how far the referee has to travel and for extra matches worked in
// the same trip/event (so one long trip covering several matches doesn't
// cost as much per match as several separate single-match trips).
const REFEREE_PRICING = {
  basePrice: null, // $ per match (first match of the trip)
  pricePerKm: null, // $ added per km traveled (one-way distance to the venue)
  additionalMatchRate: null, // $ per extra match worked in the same trip/event
};

// Trophy / award ceremony setup — a flat base fee for arranging the
// ceremony itself, plus a per-item rate for however many trophies/medals
// are needed.
const TROPHY_PRICING = {
  basePrice: null, // $ base fee per event
  pricePerItem: null, // $ per trophy/medal
};

// Custom poster design (match day / tournament / sponsorship posters, etc.)
// — a flat fee per design.
const POSTER_PRICING = {
  basePrice: null, // $ per poster design
};

module.exports = { REFEREE_PRICING, TROPHY_PRICING, POSTER_PRICING };
