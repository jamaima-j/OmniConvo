import { loadConfig } from './config';
import { dbClient } from './db/client';
import { s3Client } from './storage/s3';

/**
 * Initialize all application services
 * This should be called when the application starts
 * @throws Error if initialization fails
 */
export async function initializeApp(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfig();

    // Initialize database client
    await dbClient.initialize(config.database);
    console.log('Database client initialized');

    // Initialize S3 client
    s3Client.initialize(config.s3);
    console.log('S3 client initialized');

    // Set global base URL
    process.env.NEXT_PUBLIC_BASE_URL = config.baseUrl;
  } catch (error) {
    console.error('Failed to initialize application:', error);
    throw error;
  }
}

/**
 * Cleanup function to be called when the application shuts down
 */
export async function cleanup(): Promise<void> {
  try {
    await dbClient.close();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}
