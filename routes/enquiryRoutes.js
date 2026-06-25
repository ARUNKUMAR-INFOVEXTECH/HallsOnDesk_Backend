const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const permissionMiddleware = require("../middleware/permissionMiddleware");

const {
  createEnquiry,
  getEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
  updateEnquiry,
  convertToBooking,
  getEnquiryStats,
  addFollowup,
  completeFollowup,
  getFollowups,
  getTodaysFollowups,
  bulkCreateEnquiries,
  deleteEnquiry,
} = require("../controllers/enquiryController");

const { validateEnquiry } = require("../middleware/validationMiddleware");

const isAuthenticated = [authMiddleware, subscriptionMiddleware];
const hasPermission = (perm) => [authMiddleware, subscriptionMiddleware, permissionMiddleware(perm)];

// ---- Enquiry CRUD ----
router.get("/stats", ...hasPermission("view_bookings"), getEnquiryStats);
router.get("/followups/today", ...hasPermission("view_bookings"), getTodaysFollowups);
router.get("/", ...hasPermission("view_bookings"), getEnquiries);
router.post("/", ...hasPermission("create_bookings"), validateEnquiry, createEnquiry);
router.post("/bulk", ...hasPermission("create_bookings"), bulkCreateEnquiries);
router.get("/:id", ...hasPermission("view_bookings"), getEnquiryById);
router.put("/:id", ...hasPermission("edit_bookings"), validateEnquiry, updateEnquiry);
router.delete("/:id", ...hasPermission("delete_bookings"), deleteEnquiry);

// ---- Status transition ----
router.patch("/:id/status", ...hasPermission("edit_bookings"), updateEnquiryStatus);

// ---- Convert to booking ----
router.post("/:id/convert", ...hasPermission("create_bookings"), convertToBooking);

// ---- Followups ----
router.get("/:id/followups", ...hasPermission("view_bookings"), getFollowups);
router.post("/:id/followups", ...hasPermission("edit_bookings"), addFollowup);
router.patch("/:id/followups/:followup_id/complete", ...hasPermission("edit_bookings"), completeFollowup);

module.exports = router;