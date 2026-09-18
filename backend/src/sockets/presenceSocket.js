const online = new Map();

function initPresence(io, socket) {
  const userId = socket.data.userId;

  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId).add(socket.id);

  socket.emit("presence:online", { userIds: [...online.keys()] });

  const trackWorkspace = (workspaceId) => {
    if (!workspaceId) return;
    if (!socket.data.workspaces) socket.data.workspaces = new Set();
    socket.data.workspaces.add(String(workspaceId));
  };

  socket.on("presence:subscribe", ({ workspaceId }) => {
    if (!workspaceId) return;
    trackWorkspace(workspaceId);
    const room = `workspace:${String(workspaceId)}`;
    socket.join(room);
    io.to(room).emit("user:online", { userId });
  });

  socket.on("disconnect", () => {
    const set = online.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) online.delete(userId);
    }

    const workspaces = socket.data.workspaces || new Set();
    workspaces.forEach((workspaceId) => {
      io.to(`workspace:${workspaceId}`).emit("user:offline", { userId });
    });
    socket.data.workspaces = new Set();
  });
}

module.exports = { initPresence, online };