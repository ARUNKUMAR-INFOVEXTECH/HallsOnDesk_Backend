const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const subscriptionMiddleware = require("../middleware/Subscriptionmiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
  getOwnerHalls,
  createSecondaryHall,
  updateSecondaryHall,
  deleteSecondaryHall,
  switchHallContext,
  transferStaffMember,
} = require("../controllers/ownerHallsController");

const isOwner = [authMiddleware, roleMiddleware(["owner"]), subscriptionMiddleware];

router.get("/halls", ...isOwner, getOwnerHalls);
router.post("/halls", ...isOwner, createSecondaryHall);
router.patch("/halls/:id", ...isOwner, updateSecondaryHall);
router.delete("/halls/:id", ...isOwner, deleteSecondaryHall);
router.post("/switch-hall", ...isOwner, switchHallContext);
router.post("/staff/:id/transfer", ...isOwner, transferStaffMember);

module.exports = router;
