"use strict";

/**
 * Phase 18 — broadcasting helpers.
 *
 * Controllers and services call these instead of reaching for `io` directly.
 * That keeps three invariants in one place:
 *
 *   1. Nothing is emitted globally. Every helper targets a room.
 *   2. A helper is only ever called *after* the database write succeeded, so
 *      a failed mutation can never produce a success event.
 *   3. An event fired outside a request context (before the HTTP server is
 *      listening, or in a unit test) is a silent no-op rather than a crash.
 */

const { getIO, projectRoom, userRoom, channelRoom } = require("./store");
const { SOCKET_EVENTS } = require("./events");

function target(room) {
  const io = getIO();
  if (!io || !room) return null;
  return io.to(room);
}

/**
 * Deliver to every connected member of a project.
 *
 * The project id is merged into the envelope so a client can tell which project
 * an event belongs to without inspecting the nested entity. That matters for an
 * event already in flight when the user navigates away: the client can drop it
 * rather than writing one project's task into another project's board.
 */
function toProject(projectId, event, payload) {
  if (!projectId) return;
  target(projectRoom(projectId))?.emit(event, {
    ...payload,
    projectId: String(projectId),
  });
}

/**
 * Deliver to one user and every one of their tabs/devices. Used for
 * notifications and direct messages — never for anything a project audience
 * should see.
 */
function toUser(userId, event, payload) {
  if (!userId) return;
  target(userRoom(userId))?.emit(event, payload);
}

/** Deliver to a specific set of user rooms (e.g. both sides of a DM). */
function toUsers(userIds, event, payload) {
  const io = getIO();
  if (!io || !Array.isArray(userIds)) return;
  for (const userId of new Set(userIds.filter(Boolean).map(String))) {
    io.to(userRoom(userId)).emit(event, payload);
  }
}

/**
 * Deliver to everyone currently in a shared channel.
 *
 * Safe to call for any channel: the only way a socket gets into a
 * `channel:<id>` room is `channelSocket.handleJoin`, which consults the
 * database first (see `sockets/access.js`). The emitter itself does not and
 * cannot widen that audience.
 */
function toChannel(channelId, event, payload) {
  if (!channelId) return;
  target(channelRoom(channelId))?.emit(event, payload);
}

module.exports = {
  toProject,
  toUser,
  toUsers,
  toChannel,
  SOCKET_EVENTS,
};
