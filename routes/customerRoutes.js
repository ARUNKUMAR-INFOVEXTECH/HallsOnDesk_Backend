const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const permissionMiddleware = require("../middleware/permissionMiddleware");
const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  logCustomerInteraction,
} = require("../controllers/customerController");

const isAuthenticated = [authMiddleware, subscriptionMiddleware];
const hasPermission = (perm) => [authMiddleware, subscriptionMiddleware, permissionMiddleware(perm)];

router.get("/", ...hasPermission("view_customers"), getCustomers);
router.get("/:id", ...hasPermission("view_customers"), getCustomerById);
router.post("/", ...hasPermission("create_customers"), createCustomer);
router.put("/:id", ...hasPermission("edit_customers"), updateCustomer);
router.delete("/:id", ...hasPermission("delete_customers"), deleteCustomer);
router.post("/:id/interactions", ...hasPermission("edit_customers"), logCustomerInteraction);

module.exports = router;