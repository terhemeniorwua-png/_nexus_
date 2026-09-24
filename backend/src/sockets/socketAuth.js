const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const COOKIE_NAME = process.env.NEXUS_COOKIE_NAME || "nexus_token";

function extractToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth.trim()) {
    return fromAuth.replace(/^Bearer\s+/i, "").trim();
  }

  const fromHeader = socket.handshake.headers?.authorization;
  if (typeof fromHeader === "string" && fromHeader.trim()) {
    return fromHeader.replace(/^Bearer\s+/i, "").trim();
  }

  const cookieHeader = socket.handshake.headers?.cookie || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  return null;
}

const socketAuth = async (socket, next) => {
  try {
    // Read token from handshake auth or headers
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;

    if (!authHeader) {
      console.log("[Socket Auth Error] No token provided in handshake");
      return next(new Error("Unauthorized: Token missing"));
    }

    // Strip "Bearer " prefix if present
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    // Verify token against JWT secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user ID to socket instance
    socket.data = socket.data || {};
    socket.data.userId = decoded.id || decoded.userId || decoded._id;

    console.log(`[Socket Auth Success] Authenticated user: ${socket.data.userId}`);
    next();
  } catch (err) {
    console.log("[Socket Auth Error] Token verification failed:", err.message);
    return next(new Error("Unauthorized: Invalid or expired token"));
  }
};



module.exports = { socketAuth };