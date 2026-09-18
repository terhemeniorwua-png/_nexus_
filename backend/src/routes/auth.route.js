const express = require("express");
const { register, login, logout, forgotPassword, me } = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.get("/me", authenticate, me);

module.exports = router;