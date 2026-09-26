const express = require("express");
const {
  register,
  login,
  logout,
  forgotPassword,
  me,
  updateProfile,
  changePassword,
} = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/authenticate");
const { authRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/register", authRateLimit, register);
router.post("/login", authRateLimit, login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.get("/me", authenticate, me);
// Phase 23 — self-service account settings. PATCH rather than PUT because only
// the fields that were sent change.
router.patch("/me", authenticate, updateProfile);
router.post("/change-password", authenticate, authRateLimit, changePassword);

module.exports = router;