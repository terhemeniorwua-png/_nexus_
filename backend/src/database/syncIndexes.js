const dotenv = require("dotenv");
const path = require("path");
const mongoose = require("mongoose");
const { ensureIndexes } = require("./seed");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

async function syncIndexes() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");

  await mongoose.connect(uri);
  console.log(`[indexes] Connected to ${uri}`);

  await ensureIndexes();

  await mongoose.disconnect();
  console.log("[indexes] Done.");
  process.exit(0);
}

if (require.main === module) {
  syncIndexes().catch((err) => {
    console.error("[indexes] Failed:", err);
    process.exit(1);
  });
}

module.exports = { syncIndexes };