import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

type OkOrError = 'ok' | `error: ${string}`;
type HealthResponse = {
  server: 'ok';
  timestamp: string;
  db: OkOrError;
  s3: OkOrError;
};

export async function GET() {
  const result: HealthResponse = {
    server: 'ok',
    timestamp: new Date().toISOString(),
    db: 'error: not checked',
    s3: 'error: not checked',
  };

  // --- DB check (pg) ---
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    result.db = 'ok';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.db = `error: ${msg}`;
  }

  // --- S3 check ---
  try {
    const region = process.env.S3_REGION;
    const bucket = process.env.S3_BUCKET;
    if (!region) throw new Error('S3_REGION not set');
    if (!bucket) throw new Error('S3_BUCKET not set');

    const s3 = new S3Client({ region });
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    result.s3 = 'ok';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.s3 = `error: ${msg}`;
  }

  return NextResponse.json(result);
}
