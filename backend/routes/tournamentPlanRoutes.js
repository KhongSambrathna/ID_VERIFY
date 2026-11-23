const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { list, create, update, remove } = require("../controllers/tournamentPlanController");

// Trophy / tournament planning calendar — Admin only.
router.use(requireAuth, requireRole("ADMIN"));
router.get("/", list);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

module.exports = router;
