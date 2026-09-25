"use strict";

/**
 * Phase 18 — in-memory presence.
 *
 * A user can be connected from several tabs and devices at once, so "online"
 * cannot be derived from a single socket. Every connection is reference
 * counted per user:
 *
 *   1 socket connected            → ONLINE
 *   3 sockets connected           → ONLINE
 *   2 of the 3 disconnect         → still ONLINE
 *   the last socket disconnects   → OFFLINE
 *
 * This is deliberately server-memory only. It is temporary real-time state and
 * does not belong in the relational store; a horizontally scaled deployment
 * would swap this module for a shared counter (Redis) without any caller
 * changing.
 *
 * Nothing about the *user* is stored here — only ids and socket counts. No
 * keystrokes, no activity, no usage telemetry.
 */

const { getIO, workspaceRoom, userRoom } = require("./store");
const { SOCKET_EVENTS } = require("./events");
const { resolveWorkspaceAccess } = require("./access");

/** userId (string) → Set<socketId> */
const connections = new Map();

/**
 * userId (string) → Map<workspaceId (string), Set<socketId>>
 *
 * Presence is counted per workspace *and* per socket, not just per user. A user
 * with the board open in two tabs of the same workspace must stay online in
 * that workspace when either one closes — which is only knowable if each
 * workspace knows how many of that user's sockets are watching it.
 */
const visibleIn = new Map();

/**
 * Record that this socket is watching a workspace. Returns `true` when the
 * user was not already visible there through another socket, i.e. when their
 * presence should be announced to that workspace.
 */
function track(socket, workspaceId) {
  const key = String(workspaceId);
  if (!socket.data.rooms) socket.data.rooms = new Map();
  socket.data.rooms.set(key, true);

  const userId = String(socket.data.userId);
  if (!visibleIn.has(userId)) visibleIn.set(userId, new Map());

  const workspaces = visibleIn.get(userId);
  if (!workspaces.has(key)) workspaces.set(key, new Set());

  const sockets = workspaces.get(key);
  const newlyVisible = sockets.size === 0;
  sockets.add(socket.id);

  return newlyVisible;
}

/**
 * Stop tracking every workspace this socket was watching.
 *
 * Returns the workspace ids where this socket was the user's last one — the
 * only workspaces that should hear about the user going away. Everywhere else
 * they are still visible through another tab and must be left alone.
 */
function untrack(socket) {
  const rooms = socket.data.rooms || new Map();
  const userId = String(socket.data.userId);
  const workspaces = visibleIn.get(userId);

  const becameInvisible = [];

  for (const workspaceId of rooms.keys()) {
    if (!workspaces) break;

    const sockets = workspaces.get(workspaceId);
    if (!sockets) continue;

    sockets.delete(socket.id);
    if (sockets.size === 0) {
      workspaces.delete(workspaceId);
      becameInvisible.push(workspaceId);
    }
  }

  if (workspaces && workspaces.size === 0) visibleIn.delete(userId);
  socket.data.rooms = new Map();

  return becameInvisible;
}

/**
 * Register a new connection. Returns `true` when this is the user's first
 * socket (i.e. they just came online) and `false` when they were already
 * online on another tab or device.
 */
function addConnection(socket) {
  const userId = String(socket.data.userId);
  if (!connections.has(userId)) connections.set(userId, new Set());

  const sockets = connections.get(userId);
  const wasOnline = sockets.size > 0;
  sockets.add(socket.id);

  return !wasOnline;
}

/**
 * Stop tracking one workspace on behalf of one socket.
 *
 * Returns `true` when this socket was the user's last viewer there, i.e. when
 * the user is genuinely no longer visible in that workspace.
 */
function untrackOne(socket, workspaceId) {
  const key = String(workspaceId);
  const userId = String(socket.data.userId);
  const workspaces = visibleIn.get(userId);
  if (!workspaces) return false;

  const sockets = workspaces.get(key);
  if (!sockets) return false;

  socket.data.rooms?.delete(key);
  sockets.delete(socket.id);

  if (sockets.size > 0) return false;

  workspaces.delete(key);
  if (workspaces.size === 0) visibleIn.delete(userId);
  return true;
}

/**
 * Deregister a connection. Returns `true` only when the user's final socket
 * went away, which is the single moment they are genuinely offline.
 */
function removeConnection(socket) {
  const userId = String(socket.data.userId);
  const sockets = connections.get(userId);
  if (!sockets) return false;

  sockets.delete(socket.id);
  if (sockets.size > 0) return false;

  connections.delete(userId);
  return true;
}

function isOnline(userId) {
  const sockets = connections.get(String(userId));
  return Boolean(sockets && sockets.size > 0);
}

function onlineUserIds(workspaceId) {
  const room = String(workspaceId);
  return [...connections.keys()].filter((userId) => {
    const workspaces = visibleIn.get(userId);
    return Boolean(workspaces && workspaces.has(room));
  });
}

/** Tell a workspace who just came online. */
function announceOnline(userId) {
  const id = String(userId);
  const workspaces = visibleIn.get(id);
  if (!workspaces) return;

  for (const workspaceId of workspaces.keys()) {
    getIO()?.to(workspaceRoom(workspaceId)).emit(SOCKET_EVENTS.USER_ONLINE, {
      userId: id,
      online: true,
    });
  }
}

/** Tell a workspace the user has left. */
function announceOffline(userId, workspaceIds) {
  const id = String(userId);
  for (const workspaceId of workspaceIds) {
    getIO()?.to(workspaceRoom(workspaceId)).emit(SOCKET_EVENTS.USER_OFFLINE, {
      userId: id,
      online: false,
    });
  }
}

/**
 * Authorize a presence subscription.
 *
 * Presence is workspace-scoped, so a socket may only watch a workspace the
 * authenticated user actually belongs to — the same rule the REST layer
 * applies through `memberOf`. Knowing a workspace id is never enough.
 */
async function canSubscribeToWorkspace({ userId, workspaceId }) {
  if (!workspaceId) return false;
  const access = await resolveWorkspaceAccess({ userId, workspaceId });
  return Boolean(access);
}

/** Hand a freshly connected socket its private room and presence bookkeeping. */
function registerSocket(socket) {
  socket.join(userRoom(socket.data.userId));

  const firstSocket = addConnection(socket);
  // A brand new connection is not yet visible in any workspace, so there is
  // nobody to notify yet; `track()` announces presence on subscribe.
  if (firstSocket) socket.data.announcedOnline = false;
  else socket.data.announcedOnline = true;

  socket.on("disconnect", () => {
    // Order matters: `untrack` reports the workspaces where this socket was the
    // user's last viewer, and `removeConnection` reports whether the user still
    // has any socket at all. Both must agree before anyone is told they left.
    const noLongerVisibleIn = untrack(socket);
    const wasOnline = removeConnection(socket);
    if (wasOnline && noLongerVisibleIn.length > 0) {
      announceOffline(socket.data.userId, noLongerVisibleIn);
    }
  });

  return firstSocket;
}

module.exports = {
  registerSocket,
  track,
  untrack,
  untrackOne,
  addConnection,
  removeConnection,
  isOnline,
  onlineUserIds,
  announceOnline,
  announceOffline,
  canSubscribeToWorkspace,
  connections,
};
