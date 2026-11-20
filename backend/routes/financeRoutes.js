const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middleware/auth");
const c = require("../controllers/financeController");

// Personal income / expenses / debts — Admin only, and every record is
// private to the Admin account that created it.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/summary", c.summary);

router.get("/txns", c.listTxns);
router.post("/txns", c.createTxn);
router.put("/txns/:id", c.updateTxn);
router.delete("/txns/:id", c.deleteTxn);

router.get("/debts", c.listDebts);
router.post("/debts", c.createDebt);
router.put("/debts/:id", c.updateDebt);
router.delete("/debts/:id", c.deleteDebt);
router.post("/debts/:id/payments", c.addPayment);
router.delete("/debts/:id/payments/:paymentId", c.deletePayment);

router.get("/plans", c.listPlans);
router.post("/plans", c.createPlan);
router.put("/plans/:id", c.updatePlan);
router.delete("/plans/:id", c.deletePlan);

module.exports = router;
