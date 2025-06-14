import { Pool } from 'pg';
import { DatabaseConfig } from './types';

/**
 * Database client singleton for managing database connections
 */
class DatabaseClient {
  private static instance: DatabaseClient;
  private pool: Pool | null = null;

  private constructor() {}

  /**
   * Get the singleton instance of DatabaseClient
   */
  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  /**
   * Initialize the database connection pool
   * @param config Database configuration
   */
  public async initialize(config: DatabaseConfig): Promise<void> {
    if (this.pool) {
      throw new Error('Database client already initialized');
    }

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });

    // Test the connection
    try {
      const client = await this.pool.connect();
      client.release();
    } catch (error) {
      this.pool = null;
      throw new Error(`Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the database connection pool
   * @throws Error if the client is not initialized
   */
  public getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database client not initialized');
    }
    return this.pool;
  }

  /**
   * Close all database connections
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

export const dbClient = DatabaseClient.getInstance();
