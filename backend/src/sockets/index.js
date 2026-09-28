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
// Phase 25 — the same origin policy the HTTP layer enforces, from the same
// module. Before this, the socket layer parsed CLIENT_URL itself and the two
// could disagree, which showed up as an app whose REST calls worked and whose
// realtime updates never arrived.
const {
  ALLOWED_METHODS,
  originCallback,
  configuredOrigins,
  describePolicy,
} = require("../config/cors");

// Retained as a named export: it is the static list for callers that want to
// inspect the configuration, while the handshake below uses the per-request
// callback so the development loopback rule applies to sockets too.
function allowedOrigins() {
  return configuredOrigins();
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      // Dynamic, for the same reason the HTTP layer's is: a per-request
      // decision is what allows loopback during development without widening
      // the production policy.
      origin: originCallback,
      credentials: true,
      methods: ALLOWED_METHODS,
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

  console.log(`[nexus] CORS policy: ${describePolicy()}`);

  return io;
}

module.exports = { initSocket, allowedOrigins };
