const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const COOKIE_NAME = process.env.NEXUS_COOKIE_NAME || "nexus_token";

async function socketAuth(socket, next) {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));

    if (!match) {
      return next(new Error("Unauthorized"));
    }

    const token = decodeURIComponent(match[1]);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload || !payload.userId) {
      return next(new Error("Unauthorized"));
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = String(user._id);
    socket.data.user = user;
    next();
  } catch (error) {
    next(new Error("Unauthorized"));
  }
}

module.exports = { socketAuth };