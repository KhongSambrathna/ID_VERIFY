const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  listProducts,
  listPublicProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  createMovement,
  listMovements,
  deleteMovement,
  report,
} = require("../controllers/productController");

// Public — the storefront (/shop) reads this without logging in.
router.get("/public", listPublicProducts);

// Admin only, below this line.
router.use(requireAuth, requireRole("ADMIN"));

// Stock in / sales out / adjustments + the profit report. Registered before
// "/:id" so "movements" and "report" are never mistaken for a product id.
router.get("/report", report);
router.get("/movements", listMovements);
router.post("/movements", createMovement);
router.delete("/movements/:id", deleteMovement);

router.get("/", listProducts);
router.post("/", upload.fields([{ name: "image", maxCount: 1 }]), createProduct);
router.put("/:id", upload.fields([{ name: "image", maxCount: 1 }]), updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;
