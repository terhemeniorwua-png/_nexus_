"use strict";

/**
 * Phase 18/19 — shared channel rooms.
 *
 * A channel is joined only by workspace members who can see that channel: the
 * join handler resolves the channel through the database before adding anyone
 * to a room, so membership in a room is itself a fact the server established,
 * not something the client asked for.
 *
 * Direct messages are deliberately absent from this file. A DM is never routed
 * through a shared room — it is emitted to the two participants' private
 * `user:<id>` rooms only — so there is no DM room to join, and no way for a
 * third party to subscribe to somebody's private conversation.
 *
 * Note on handler shape: a Socket.IO listener is invoked as
 * `handler(...emittedArgs)`, so the connection is *not* passed to it. The
 * handlers below are therefore closures over the connection.
 */

const { SOCKET_EVENTS, CLIENT_EVENTS } = require("./events");
const { channelRoom } = require("./store");
const { resolveChannelAccess } = require("./access");

function initChannel(io, socket) {
  function deny(channelId) {
    socket.emit(SOCKET_EVENTS.CHANNEL_DENIED, {
      channelId: channelId ? String(channelId) : null,
      message: "You do not have access to this conversation",
    });
  }

  async function handleJoin(payload) {
    const { workspaceId, channelId } = payload || {};
    if (!channelId) return deny(channelId);

    // The room is keyed by channel id alone, so the workspace is only needed
    // here, to prove the channel really belongs to a workspace this user is in.
    if (!workspaceId) return deny(channelId);

    try {
      const access = await resolveChannelAccess({
        userId: socket.data.userId,
        workspaceId,
        channelId,
      });
      if (!access) return deny(channelId);

      socket.join(channelRoom(access.channelId));
      if (!socket.data.channels) socket.data.channels = new Set();
      socket.data.channels.add(String(access.channelId));

      socket.emit(SOCKET_EVENTS.CHANNEL_JOINED, {
        workspaceId: String(workspaceId),
        channelId: String(access.channelId),
      });
    } catch {
      return deny(channelId);
    }
  }

  function handleLeave(payload) {
    const { channelId } = payload || {};
    if (!channelId) return;

    // Rooms are keyed by channel id only, so this can drop the subscription
    // without needing to know which workspace it came from — a leave that
    // arrives with no workspace context still works.
    socket.leave(channelRoom(channelId));
    if (socket.data.channels) socket.data.channels.delete(String(channelId));
  }

  socket.on(CLIENT_EVENTS.CHANNEL_JOIN, handleJoin);
  socket.on(CLIENT_EVENTS.CHANNEL_LEAVE, handleLeave);
}

module.exports = { initChannel };
