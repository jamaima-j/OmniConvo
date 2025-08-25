// lib/init.ts
import { dbClient } from "@/lib/db/client";
import { s3Client } from "@/lib/storage/s3";
import { loadConfig } from "@/lib/config";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  console.log("=== INIT DB + S3 (lib/init.ts) ===");

  // Initialize database client (no args — reads from env vars)
  await dbClient.initialize();
  console.log("Database client initialized");

  // Initialize S3 client (needs config)
  const config = loadConfig();
  s3Client.initialize(config.s3);
  console.log("S3 client initialized");

  isInitialized = true;
}

export async function ensureInitialized() {
  if (isInitialized) {
    try {
      dbClient.getPool(); // throws if pool missing
      return;
    } catch {
      isInitialized = false;
    }
  }

  if (!initPromise) {
    initPromise = reallyInitialize().catch((err) => {
      initPromise = null;
      isInitialized = false;
      throw err;
    });
  }

  await initPromise;
  dbClient.getPool(); // sanity check
}
