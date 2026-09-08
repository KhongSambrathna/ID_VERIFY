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
} = require("../controllers/productController");

// Public — the storefront (/shop) reads this without logging in.
router.get("/public", listPublicProducts);

// Admin only, below this line.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listProducts);
router.post("/", upload.fields([{ name: "image", maxCount: 1 }]), createProduct);
router.put("/:id", upload.fields([{ name: "image", maxCount: 1 }]), updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;
