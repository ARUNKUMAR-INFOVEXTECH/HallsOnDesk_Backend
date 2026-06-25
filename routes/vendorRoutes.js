const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const permissionMiddleware = require("../middleware/permissionMiddleware");
const {
  createVendor,
  getVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
} = require("../controllers/VendorController");
const {
  getVendorAllocations,
  getVendorAllocationStats,
} = require("../controllers/bookingVendorController");

const featureGate = require("../middleware/featureGate");

const isAuthenticated = [authMiddleware, subscriptionMiddleware, featureGate("vendors")];
const hasPermission = (perm) => [authMiddleware, subscriptionMiddleware, featureGate("vendors"), permissionMiddleware(perm)];

router.get("/", ...hasPermission("view_vendors"), getVendors);
router.get("/:id/allocations", ...hasPermission("view_vendors"), getVendorAllocations);
router.get("/:id/allocation-stats", ...hasPermission("view_vendors"), getVendorAllocationStats);
router.get("/:id", ...hasPermission("view_vendors"), getVendorById);
router.post("/", ...hasPermission("manage_vendors"), createVendor);
router.put("/:id", ...hasPermission("manage_vendors"), updateVendor);
router.delete("/:id", ...hasPermission("manage_vendors"), deleteVendor);

module.exports = router;