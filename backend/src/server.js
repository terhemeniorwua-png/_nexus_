const dotenv = require("dotenv");

dotenv.config();

const http = require("http");
const connectDB = require("./config/db");
const app = require("./app");
const { initSocket } = require("./sockets");

const port = Number(process.env.PORT) || 5000;

async function start() {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(port, () => {
    console.log(`[nexus] API running at http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("[nexus] Failed to start server:", err);
  process.exit(1);
});