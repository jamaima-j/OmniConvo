// lib/db/client.ts
import { Pool } from 'pg';

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

    let poolConfig: any = {};

    // === Debug raw environment variables ===
    console.log('=== DB ENV DEBUG ===');
    console.log('DEBUG: DATABASE_URL:', process.env.DATABASE_URL);
    console.log('DEBUG: DB_HOST:', process.env.DB_HOST);
    console.log('DEBUG: DB_PORT:', process.env.DB_PORT);
    console.log('DEBUG: DB_USER:', process.env.DB_USER);
    console.log('DEBUG: DB_PASSWORD raw value:', process.env.DB_PASSWORD);
    console.log('DEBUG: typeof DB_PASSWORD:', typeof process.env.DB_PASSWORD);
    console.log('DEBUG: length:', process.env.DB_PASSWORD?.length);
    console.log('DEBUG: DB_NAME:', process.env.DB_NAME);
    console.log('====================');

    if (process.env.DATABASE_URL) {
      let connectionString = String(process.env.DATABASE_URL);

      // Fix old protocol if needed
      if (connectionString.startsWith('postgres://')) {
        connectionString = connectionString.replace('postgres://', 'postgresql://');
      }

      poolConfig = { connectionString };
    } else {
      poolConfig = {
        host: String(process.env.DB_HOST || '127.0.0.1'),
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: String(process.env.DB_NAME || ''),
        user: String(process.env.DB_USER || ''),
        password: String(process.env.DB_PASSWORD || ''), // force string
      };
    }

    // Debug what we’re actually passing to pg
    console.log('=== FINAL POOL CONFIG DEBUG ===');
    if (poolConfig.connectionString) {
      console.log('Using connectionString:', poolConfig.connectionString);
    } else {
      console.log('Host:', poolConfig.host);
      console.log('Port:', poolConfig.port);
      console.log('Database:', poolConfig.database);
      console.log('User:', poolConfig.user);
      console.log('Password typeof:', typeof poolConfig.password);
      console.log('Password length:', poolConfig.password?.length);
    }
    console.log('================================');

    this.pool = new Pool(poolConfig);

    // Test query
    const client = await this.pool.connect();
    await client.query('SELECT 1');
    client.release();

    console.log('Database connection initialized successfully ✅');
  }

  public getPool(): Pool {
    if (!this.pool) throw new Error('Database client not initialized');
    return this.pool;
  }
}

export const dbClient = DatabaseClient.getInstance();
