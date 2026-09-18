function initMessage(io, socket) {
  socket.on("channel:join", ({ workspaceId, channelId }) => {
    if (!workspaceId || !channelId) return;

    const room = `workspace:${String(workspaceId)}:channel:${String(channelId)}`;
    socket.join(room);

    io.to(room).emit("channel:presence", {
      channelId: String(channelId),
      userId: socket.data.userId,
    });
  });

  socket.on("channel:leave", ({ workspaceId, channelId }) => {
    if (!channelId) return;
    const room = `workspace:${workspaceId ? `${workspaceId}:` : ""}channel:${String(channelId)}`;
    socket.leave(room);
  });
}

module.exports = { initMessage };