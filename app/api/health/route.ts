import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

export async function GET() {
  const result: Record<string, any> = {
    server: 'ok',
    timestamp: new Date().toISOString(),
  };

  // --- DB check (direct, no dbClient dependency) ---
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    result.db = 'ok';
  } catch (e: any) {
    result.db = `error: ${e.message}`;
  }

  // --- S3 check ---
  try {
    const s3 = new S3Client({ region: process.env.S3_REGION });
    await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
    result.s3 = 'ok';
  } catch (e: any) {
    result.s3 = `error: ${e.message}`;
  }

  return NextResponse.json(result);
}
