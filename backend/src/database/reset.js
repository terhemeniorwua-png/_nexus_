const dotenv = require("dotenv");
const path = require("path");
const { MongoClient } = require("mongodb");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

async function resetDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGO_URI in environment variables.");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db().dropDatabase();
  await client.close();
  console.log("[reset] Database dropped.");

  const { runSeed } = require("./seed");
  await runSeed();
}

if (require.main === module) {
  resetDatabase().catch((err) => {
    console.error("[reset] Failed:", err);
    process.exit(1);
  });
}

module.exports = { resetDatabase };