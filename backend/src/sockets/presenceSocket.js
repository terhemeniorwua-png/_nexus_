"use strict";

/**
 * Phase 18 — presence handlers.
 *
 * A socket asks to watch a workspace; the server answers with a scoped
 * snapshot of who is online there and then keeps the client up to date.
 *
 * Two rules shape this file:
 *
 *   1. The snapshot is scoped to the requested workspace. The server never
 *      broadcasts its global online list to a connecting client.
 *   2. `user:offline` is only emitted when a user's *last* socket goes away
 *      (see presence.js), so closing one of five tabs does not mark a still
 *      connected user as offline.
 */

const { SOCKET_EVENTS, CLIENT_EVENTS } = require("./events");
const { workspaceRoom } = require("./store");
const presence = require("./presence");

/**
 * Send the caller the current online roster for a workspace it is allowed to
 * watch, and mark it online in that workspace.
 */
function sendSnapshot(socket, workspaceId) {
  const room = workspaceRoom(workspaceId);
  socket.join(room);

  const newlyVisible = presence.track(socket, workspaceId);
  if (newlyVisible) {
    presence.announceOnline(socket.data.userId);
  }

  socket.emit(SOCKET_EVENTS.PRESENCE_SNAPSHOT, {
    workspaceId: String(workspaceId),
    userIds: presence.onlineUserIds(workspaceId),
  });
}

function initPresence(io, socket) {
  socket.on(CLIENT_EVENTS.PRESENCE_SUBSCRIBE, async (payload) => {
    try {
      const workspaceId = payload?.workspaceId;
      if (!workspaceId) return;

      const allowed = await presence.canSubscribeToWorkspace({
        userId: socket.data.userId,
        workspaceId,
      });
      if (!allowed) return;

      if (!socket.data.workspaces) socket.data.workspaces = new Set();
      socket.data.workspaces.add(String(workspaceId));

      sendSnapshot(socket, workspaceId);
    } catch {
      // A failed lookup must never take the connection down.
    }
  });

  // Client-driven navigation away from a workspace. Without this, a client that
  // moves between workspaces would keep receiving — and keep being counted in —
  // the rooms it left.
  socket.on(CLIENT_EVENTS.PRESENCE_UNSUBSCRIBE, (payload) => {
    const workspaceId = payload?.workspaceId ? String(payload.workspaceId) : null;
    if (!workspaceId) return;

    const wasVisible = presence.untrackOne(socket, workspaceId);
    socket.leave(workspaceRoom(workspaceId));
    socket.data.workspaces?.delete(workspaceId);

    if (wasVisible) {
      presence.announceOffline(socket.data.userId, [workspaceId]);
    }
  });
}

module.exports = { initPresence, sendSnapshot };
