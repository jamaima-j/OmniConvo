import { DatabaseConfig } from './db/types';
import { S3Config } from './storage/s3';

/**
 * Environment variable keys
 */
export const ENV_KEYS = {
  // Application
  NEXT_PUBLIC_BASE_URL: 'NEXT_PUBLIC_BASE_URL',

  // Database
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT',
  DB_NAME: 'DB_NAME',
  DB_USER: 'DB_USER',
  DB_PASSWORD: 'DB_PASSWORD',

  // AWS S3
  AWS_REGION: 'AWS_REGION',
  AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
  AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
  AWS_BUCKET_NAME: 'AWS_BUCKET_NAME',
} as const;

/**
 * Validate that a required environment variable exists
 * @throws Error if the variable is missing
 */
export function requireEnv(key: keyof typeof ENV_KEYS): string {
  const value = process.env[ENV_KEYS[key]];
  if (!value) {
    throw new Error(`Missing required environment variable: ${ENV_KEYS[key]}`);
  }
  return value;
}

/**
 * Get database configuration
 * @throws Error if any required variables are missing
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: requireEnv(ENV_KEYS.DB_HOST),
    port: parseInt(requireEnv(ENV_KEYS.DB_PORT), 10),
    database: requireEnv(ENV_KEYS.DB_NAME),
    user: requireEnv(ENV_KEYS.DB_USER),
    password: requireEnv(ENV_KEYS.DB_PASSWORD),
  };
}

/**
 * Get S3 configuration
 * @throws Error if any required variables are missing
 */
export function getS3Config(): S3Config {
  return {
    region: requireEnv(ENV_KEYS.AWS_REGION),
    accessKeyId: requireEnv(ENV_KEYS.AWS_ACCESS_KEY_ID),
    secretAccessKey: requireEnv(ENV_KEYS.AWS_SECRET_ACCESS_KEY),
    bucketName: requireEnv(ENV_KEYS.AWS_BUCKET_NAME),
  };
}

/**
 * Application configuration
 */
export interface AppConfig {
  baseUrl: string;
  database: DatabaseConfig;
  s3: S3Config;
}

/**
 * Load and validate application configuration from environment variables
 * @throws Error if required environment variables are missing
 */
export function loadConfig(): AppConfig {
  return {
    baseUrl: requireEnv(ENV_KEYS.NEXT_PUBLIC_BASE_URL),
    database: getDatabaseConfig(),
    s3: getS3Config(),
  };
}
