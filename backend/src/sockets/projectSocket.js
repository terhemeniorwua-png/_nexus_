"use strict";

/**
 * Phase 18 — project rooms.
 *
 * A project room carries every task, column, comment and deliverable event for
 * one project. Joining is authorized against the real access model, so a user
 * who is not a member of a project cannot subscribe to it simply by sending
 * its id:
 *
 *   socket user → project lookup → workspace membership → project role
 *              → allowed? join `project:<id>` : emit project:denied
 *
 * `board:join` / `board:leave` are kept as aliases of the canonical
 * `project:join` / `project:leave` so an older client keeps working.
 *
 * Note on handler shape: a Socket.IO listener is invoked as
 * `handler(...emittedArgs)`, so the connection is *not* passed to it. The
 * handlers below are therefore closures over the connection, which is the only
 * safe way to reach it.
 */

const mongoose = require("mongoose");
const { SOCKET_EVENTS, CLIENT_EVENTS } = require("./events");
const { projectRoom } = require("./store");
const { resolveProjectAccess } = require("./access");

function initProject(io, socket) {
  function deny(projectId) {
    socket.emit(SOCKET_EVENTS.PROJECT_DENIED, {
      projectId: projectId ? String(projectId) : null,
      message: "You do not have access to this project",
    });
  }

  async function handleJoin(payload) {
    const projectId = payload?.projectId;
    const workspaceId = payload?.workspaceId;

    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return deny(projectId);
    }

    try {
      const access = await resolveProjectAccess({
        userId: socket.data.userId,
        projectId,
        workspaceId: workspaceId || null,
      });

      if (!access) return deny(projectId);

      socket.join(projectRoom(projectId));
      if (!socket.data.projects) socket.data.projects = new Set();
      socket.data.projects.add(String(projectId));

      socket.emit(SOCKET_EVENTS.PROJECT_JOINED, {
        projectId: String(projectId),
        workspaceId: access.workspaceId,
        role: access.role,
      });
    } catch {
      return deny(projectId);
    }
  }

  function handleLeave(payload) {
    const projectId = payload?.projectId;
    if (!projectId) return;

    socket.leave(projectRoom(projectId));
    if (socket.data.projects) socket.data.projects.delete(String(projectId));
  }

  socket.on(CLIENT_EVENTS.PROJECT_JOIN, handleJoin);
  socket.on(CLIENT_EVENTS.PROJECT_LEAVE, handleLeave);

  // Backward-compatible aliases for the pre-Phase-18 client vocabulary.
  socket.on("board:join", handleJoin);
  socket.on("board:leave", handleLeave);
}

module.exports = { initProject };
