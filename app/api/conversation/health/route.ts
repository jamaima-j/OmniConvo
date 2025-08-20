import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple health check endpoint.
 * Returns HTTP 200 if the server is up and running.
 */
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
