const express = require("express");
const router = express.Router();
const {
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule
} = require("../controllers/venuePricingController");
const authMiddleware = require("../middleware/authMiddleware");

// All pricing rule endpoints are isolated to authenticated tenants
router.use(authMiddleware);

router.get("/", getPricingRules);
router.post("/", createPricingRule);
router.put("/:id", updatePricingRule);
router.delete("/:id", deletePricingRule);

module.exports = router;
