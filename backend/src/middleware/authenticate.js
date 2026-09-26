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

  // Phase 23 — changing a password has to end the sessions it was meant to end.
  // A JWT stays cryptographically valid until it expires, so without this a
  // stolen or borrowed token would survive a password change by up to
  // JWT_EXPIRES_IN. A token issued before the change is refused; one issued
  // after it (a fresh sign-in) is not. Both sides compare in whole seconds
  // because that is the resolution of `iat`.
  if (user.passwordChangedAt) {
    const changedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (typeof payload.iat === "number" && payload.iat < changedAtSec) {
      return res.status(401).json({
        success: false,
        message: "Your password has changed. Please sign in again.",
      });
    }
  }

  req.user = user;
  next();
}

module.exports = { authenticate, COOKIE_NAME };