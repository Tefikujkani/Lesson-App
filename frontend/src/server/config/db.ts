import mongoose from "mongoose";

let isConnected = false;

/**
 * Connect once and reuse the pooled Mongoose connection across requests.
 * Local Express server: default pool is fine; keep a single shared client.
 */
export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not defined. Add it to your .env file (MongoDB Atlas or local connection string)."
    );
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    // Modest concurrency for a student study app on one Node process
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
  });

  isConnected = true;
  console.log(`MongoDB connected (${mongoose.connection.name})`);
}

export function isDatabaseConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
