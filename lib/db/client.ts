// lib/db/client.ts
import { Pool } from "pg";
import { getDatabaseConfig } from "../config";

class DatabaseClient {
  private static instance: DatabaseClient;
  private pool: Pool | null = null;

  private constructor() {}

  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  public async initialize(): Promise<void> {
    if (this.pool) return;

    // --- DEBUG ENV LOGS ---
    console.log("=== DB POOL CONFIG DEBUG ===", {
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password_type: typeof process.env.DB_PASSWORD,
      password_length: process.env.DB_PASSWORD?.length,
      password_value: process.env.DB_PASSWORD, // ⚠️ remove later for security
      database: process.env.DB_NAME,
    });

    // Prefer DATABASE_URL if set, else fall back to individual params
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: false,
      });
    } else {
      const config = getDatabaseConfig();
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: false,
      });
    }
  }

  public getPool(): Pool {
    if (!this.pool) throw new Error("Database client not initialized");
    return this.pool;
  }
}

export const dbClient = DatabaseClient.getInstance();
