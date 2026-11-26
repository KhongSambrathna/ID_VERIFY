const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const { listClasses, listStudents, importStudents, syncNow } = require("../controllers/schoolImportController");

// 🏫 Import students from the school-management app — Admin only.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/classes", listClasses);
router.get("/students", listStudents);
router.post("/import", importStudents);
router.post("/sync", syncNow);

module.exports = router;
