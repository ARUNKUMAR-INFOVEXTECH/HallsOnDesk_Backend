const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const permissionMiddleware = require("../middleware/permissionMiddleware");
const {
  checkAvailability,
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getBookingStats,
  deleteBooking,
} = require("../controllers/bookingController");
const {
  allocateVendor,
  updateAllocation,
  deallocateVendor,
  getBookingVendors,
} = require("../controllers/bookingVendorController");

const { validateBooking } = require("../middleware/validationMiddleware");

const isAuthenticated = [authMiddleware, subscriptionMiddleware];
const hasPermission = (perm) => [authMiddleware, subscriptionMiddleware, permissionMiddleware(perm)];

router.get("/check-availability", ...isAuthenticated, checkAvailability);
router.get("/stats", ...hasPermission("view_bookings"), getBookingStats);
router.get("/", ...hasPermission("view_bookings"), getBookings);
router.get("/:id", ...hasPermission("view_bookings"), getBookingById);
router.post("/", ...hasPermission("create_bookings"), validateBooking, createBooking);
router.put("/:id", ...hasPermission("edit_bookings"), validateBooking, updateBooking);
router.patch("/:id/cancel", ...hasPermission("edit_bookings"), cancelBooking);
router.delete("/:id", ...hasPermission("delete_bookings"), deleteBooking);

// Vendor allocations routes
router.get("/:bookingId/vendors", ...hasPermission("view_bookings"), getBookingVendors);
router.post("/:bookingId/vendors", ...hasPermission("edit_bookings"), allocateVendor);
router.put("/:bookingId/vendors/:vendorId", ...hasPermission("edit_bookings"), updateAllocation);
router.delete("/:bookingId/vendors/:vendorId", ...hasPermission("edit_bookings"), deallocateVendor);

module.exports = router;