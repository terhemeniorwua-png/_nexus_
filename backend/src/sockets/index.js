const { Server } = require("socket.io");
const { setIO } = require("./store");
const { socketAuth } = require("./socketAuth");
const { initPresence } = require("./presenceSocket");
const { initBoard } = require("./boardSocket");
const { initMessage } = require("./messageSocket");

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  setIO(io);

  io.use(socketAuth);

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);

    initPresence(io, socket);
    initBoard(io, socket);
    initMessage(io, socket);
  });

  return io;
}

module.exports = { initSocket };