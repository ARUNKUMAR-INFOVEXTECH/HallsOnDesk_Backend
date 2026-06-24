const express = require("express");
const router = express.Router();
const { loginUser, refreshToken, getProfile, createSuperAdmin, forgotPassword, resetPassword, changePassword } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/login", loginUser);
router.post("/refresh", refreshToken);
router.post("/refresh-token", refreshToken); // alias to match frontend API client
router.get("/profile", authMiddleware, getProfile);
router.post("/create-super-admin", createSuperAdmin); // bootstrap only
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", authMiddleware, changePassword);

module.exports = router;