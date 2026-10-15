const express = require("express");
const {
  register,
  login,
  logout,
  forgotPassword,
  me,
  updateProfile,
  changePassword,
  uploadAvatar,
} = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/authenticate");
const { authRateLimit, authRequestLimit } = require("../middleware/rateLimit");
const { createAvatarUpload, handleAvatarUploadError } = require("../middleware/upload");

const router = express.Router();

// Phase 24 — the credential endpoints carry a request-rate ceiling (429) in
// front of the existing failed-attempt lockout, so the limiter runs before any
// bcrypt hashing, JWT signing, or database lookup. `/forgot-password` had no
// limiter at all before this.
router.post("/register", authRequestLimit("register"), authRateLimit, register);
router.post("/login", authRequestLimit("login"), authRateLimit, login);
router.post("/logout", logout);
router.post(
  "/forgot-password",
  authRequestLimit("forgotPassword"),
  authRateLimit,
  forgotPassword
);
router.get("/me", authenticate, me);
// Phase 23 — self-service account settings. PATCH rather than PUT because only
// the fields that were sent change.
router.patch("/me", authenticate, updateProfile);
// Profile picture upload: multipart/form-data with a single `avatar` image.
// The limiter caps how often the (comparatively expensive) image write runs.
router.post(
  "/me/avatar",
  authenticate,
  authRateLimit,
  createAvatarUpload("avatar"),
  handleAvatarUploadError,
  uploadAvatar
);
router.post("/change-password", authenticate, authRateLimit, changePassword);

module.exports = router;