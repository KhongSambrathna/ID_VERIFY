// Fixed jersey/shirt size options for jerseyOrderSchema.jerseySize — Kids
// (age-based numbering, the usual convention for youth jersey sizing) then
// Adult (standard S–3XL), shown in this order as one flat dropdown on both
// the self-register and register-on-behalf forms. Shared between the Team
// model (schema-level enum) and jerseyOrderController (request validation)
// so both stay in sync automatically.
const JERSEY_SIZES = ["20", "22", "24", "26", "28", "S", "M", "L", "XL", "XXL", "3XL"];

module.exports = { JERSEY_SIZES };
