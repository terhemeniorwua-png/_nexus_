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

  socket.on("channel:leave", ({ channelId }) => {
    if (!channelId) return;
    socket.leave(`workspace:${String(channelId)}`);
  });
}

module.exports = { initMessage };