let io = null;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

// Shared room naming so controllers and sockets agree on one convention.
const boardRoom = (projectId) => `board:${String(projectId)}`;

module.exports = { setIO, getIO, boardRoom };