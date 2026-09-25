"use strict";

/**
 * Phase 18 — socket authentication.
 *
 * A socket is a long-lived door into private Nexus data, so it is held to the
 * same standard as an HTTP request: an existing Nexus JWT, verified with the
 * existing `JWT_SECRET`, resolved to a real user in the database.
 *
 * Token sources, in order:
 *   1. `handshake.auth.token`  — what the browser client sends
 *   2. `Authorization` header  — for non-browser clients
 *   3. the `nexus_token` cookie — the httpOnly session cookie the REST API
 *      already sets, so a session restored by cookie is real-time too
 *
 * `handshake.auth.userId` is deliberately ignored: a client-supplied identity
 * is a claim, not a proof. The only identity the socket ever has is the one
 * the signature resolves to.
 */

const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const { COOKIE_NAME } = require("../middleware/authenticate");

function stripBearer(value) {
  return String(value).replace(/^Bearer\s+/i, "").trim();
}

function readCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const match = String(cookieHeader).match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function extractToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === "string" && fromAuth.trim()) return stripBearer(fromAuth);

  const fromHeader = socket.handshake.headers?.authorization;
  if (typeof fromHeader === "string" && fromHeader.trim()) return stripBearer(fromHeader);

  return readCookieToken(socket.handshake.headers?.cookie);
}

/** One message for every failure mode, so nothing about the token leaks. */
const UNAUTHORIZED = "Unauthorized: authentication required";

const socketAuth = async (socket, next) => {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error(UNAUTHORIZED));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload?.userId;
    if (!userId) return next(new Error(UNAUTHORIZED));

    // A valid signature is not enough: the account must still exist. Without
    // this a deleted user keeps a working socket until the token expires.
    const user = await User.findById(userId).select("_id name email avatar").lean();
    if (!user) return next(new Error(UNAUTHORIZED));

    // Only what a socket legitimately needs. No password hash, no role
    // guessing, no token copy left lying on the connection.
    socket.data.userId = String(user._id);
    socket.data.user = { id: String(user._id), name: user.name, email: user.email, avatar: user.avatar };
    socket.data.workspaces = new Set();

    next();
  } catch {
    // Invalid signature, expired token, malformed cookie — all the same to the
    // client, and the reason is never forwarded to it.
    return next(new Error(UNAUTHORIZED));
  }
};

module.exports = { socketAuth, extractToken, UNAUTHORIZED };
