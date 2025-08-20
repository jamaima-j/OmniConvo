import { NextResponse } from 'next/server';
import { Client } from 'pg';

// Health check route
export async function GET() {
  try {
    // Check DB connection
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', db: 'disconnected', message: error.message },
      { status: 500 }
    );
  }
}
