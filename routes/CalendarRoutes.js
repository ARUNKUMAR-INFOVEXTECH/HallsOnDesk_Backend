const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const permissionMiddleware = require("../middleware/permissionMiddleware");
const {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getUpcomingEvents,
} = require("../controllers/CalendarController");

const isAuthenticated = [authMiddleware, subscriptionMiddleware];
const hasPermission = (perm) => [authMiddleware, subscriptionMiddleware, permissionMiddleware(perm)];

router.get("/upcoming", ...hasPermission("view_bookings"), getUpcomingEvents);
router.get("/events", ...hasPermission("view_bookings"), getEvents);
router.post("/events", ...hasPermission("create_bookings"), createEvent);
router.put("/events/:id", ...hasPermission("edit_bookings"), updateEvent);
router.delete("/events/:id", ...hasPermission("delete_bookings"), deleteEvent);

module.exports = router;