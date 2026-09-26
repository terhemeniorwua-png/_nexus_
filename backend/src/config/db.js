const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('Missing MONGO_URI in environment variables.');
  }

  await mongoose.connect(uri);

  console.log(`[nexus] MongoDB connected — ${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = connectDB;