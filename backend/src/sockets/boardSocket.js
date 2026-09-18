function initBoard(_io, socket) {
  socket.on("board:join", ({ projectId, workspaceId }) => {
    if (!projectId) return;

    socket.join(`board:${String(projectId)}`);

    if (workspaceId) {
      if (!socket.data.workspaces) socket.data.workspaces = new Set();
      socket.data.workspaces.add(String(workspaceId));
      socket.join(`workspace:${String(workspaceId)}`);
    }

    socket.emit("board:joined", { projectId: String(projectId) });
  });

  socket.on("board:leave", ({ projectId }) => {
    if (projectId) socket.leave(`board:${String(projectId)}`);
  });
}

module.exports = { initBoard };