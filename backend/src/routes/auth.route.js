const express = require("express");
const { register, login, logout, forgotPassword, me } = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/authenticate");
const { authRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/register", authRateLimit, register);
router.post("/login", authRateLimit, login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.get("/me", authenticate, me);

module.exports = router;