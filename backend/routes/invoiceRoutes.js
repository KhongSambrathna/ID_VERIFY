const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  voidInvoice,
  deleteInvoice,
  finalizeInvoice,
} = require("../controllers/invoiceController");

// Shop invoices — Admin only.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listInvoices);
router.post("/", createInvoice);
router.get("/:id", getInvoice);
router.patch("/:id", updateInvoice);
router.patch("/:id/void", voidInvoice);
router.post("/:id/finalize", finalizeInvoice);
router.delete("/:id", deleteInvoice);

module.exports = router;
