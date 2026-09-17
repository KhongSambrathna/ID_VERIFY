const { REFEREE_PRICING, TROPHY_PRICING, POSTER_PRICING } = require("../utils/servicePricing");

// GET /api/services/pricing  (public, no auth) — referee, trophy/award and
// poster design service pricing for the public Pricing page. Any field
// that's still null just means an Admin hasn't given the real number yet;
// the frontend shows a "contact Admin" placeholder for those instead of a
// price.
exports.getServicePricing = (req, res) => {
  res.json({ referee: REFEREE_PRICING, trophy: TROPHY_PRICING, poster: POSTER_PRICING });
};
