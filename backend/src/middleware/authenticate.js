const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const COOKIE_NAME = process.env.NEXUS_COOKIE_NAME || "nexus_token";

async function authenticate(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    const isExpired = error.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      message: isExpired ? "Your session has expired" : "Authentication required",
    });
  }

  if (!payload || !payload.userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const user = await User.findById(payload.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  req.user = user;
  next();
}

module.exports = { authenticate, COOKIE_NAME };