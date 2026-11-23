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

router.get("/accounts", c.listAccounts);
router.post("/accounts", c.createAccount);
router.post("/accounts/transfer", c.transfer);
router.put("/accounts/:id", c.updateAccount);
router.delete("/accounts/:id", c.deleteAccount);

router.get("/settings", c.getSettings);
router.put("/settings", c.updateSettings);
router.get("/receivables", c.receivables);

// Wedding gifts I gave (ចំណងដៃ)
router.get("/wedding-gifts", c.listWeddingGifts);
router.post("/wedding-gifts", c.createWeddingGift);
router.put("/wedding-gifts/:id", c.updateWeddingGift);
router.delete("/wedding-gifts/:id", c.deleteWeddingGift);

router.get("/plans", c.listPlans);
router.get("/plan-invoices", c.planInvoices);
router.post("/plans", c.createPlan);
router.put("/plans/:id", c.updatePlan);
router.delete("/plans/:id", c.deletePlan);

// Investments / betting — daily profit & loss
const inv = require("../controllers/investController");
router.get("/invest", inv.list);
router.post("/invest", inv.create);
router.put("/invest/:id", inv.update);
router.delete("/invest/:id", inv.remove);
router.get("/invest/:id/entries", inv.entries);
router.post("/invest/:id/entries", inv.addEntry);
router.delete("/invest/:id/entries/:entryId", inv.removeEntry);

module.exports = router;
