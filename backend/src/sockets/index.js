"use strict";

/**
 * Phase 18 — Socket.IO server.
 *
 * One Socket.IO server, attached to the single HTTP server that `server.js`
 * already creates. No second Express app, no second listener.
 *
 *   Express app ─┐
 *                ├─ http server ─ Socket.IO ─ rooms ─ clients
 *   REST routes ─┘
 *
 * Layers, in the order a connection passes through them:
 *
 *   socketAuth      who is this?          (JWT + a real user in the database)
 *   projectSocket   may they see project N? (membership, then join)
 *   channelSocket   may they read channel C? (workspace membership / DM partner)
 *   presenceSocket  who is online here?     (workspace membership)
 *
 * The REST API remains the only writer. Every event this server sends is a
 * consequence of a database write that already succeeded.
 */

const { Server } = require("socket.io");
const { setIO } = require("./store");
const { socketAuth } = require("./socketAuth");
const presence = require("./presence");
const { initPresence } = require("./presenceSocket");
const { initProject } = require("./projectSocket");
const { initChannel } = require("./channelSocket");

/**
 * The trusted frontend origins, taken from the same CLIENT_URL the Express
 * CORS configuration already uses. A comma-separated list is accepted for
 * deployments that serve more than one trusted host; `*` is never used.
 */
function allowedOrigins() {
  const configured = process.env.CLIENT_URL || "http://localhost:3000";
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins(),
      credentials: true,
      methods: ["GET", "POST"],
    },
    // A dead transport must not be mistaken for a live connection.
    pingTimeout: 20000,
  });

  setIO(io);

  // Unauthenticated sockets never reach a handler.
  io.use(socketAuth);

  io.on("connection", (socket) => {
    // Private room for this user: notifications and direct messages.
    presence.registerSocket(socket);

    // A malformed or hostile handler payload must not take the server down.
    socket.on("error", () => {});

    initPresence(io, socket);
    initProject(io, socket);
    initChannel(io, socket);
  });

  // Transport-level failures (CORS rejection, malformed handshake, bad
  // transport upgrade) are reported, never thrown: a bad client must not be
  // able to crash the API process.
  io.engine?.on("connection_error", (error) => {
    console.error("[nexus] Socket transport error:", error?.message || "unknown");
  });

  return io;
}

module.exports = { initSocket, allowedOrigins };
