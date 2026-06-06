const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  checkPremiumStatus,
  toggleMultiHall,
  toggleDifferentStaff,
  registerSecondHall,
} = require("../controllers/multiHallController");

const isOwner = [authMiddleware, roleMiddleware(["owner"]), subscriptionMiddleware];

router.get("/premium-status", ...isOwner, checkPremiumStatus);
router.post("/toggle-feature", ...isOwner, toggleMultiHall);
router.post("/toggle-staff-mode", ...isOwner, toggleDifferentStaff);
router.post("/register-hall", ...isOwner, registerSecondHall);

module.exports = router;
