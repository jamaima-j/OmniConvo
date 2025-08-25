// app/api/debug-env/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const result = {
      DATABASE_URL: process.env.DATABASE_URL || null,
      DB_HOST: process.env.DB_HOST || null,
      DB_PORT: process.env.DB_PORT || null,
      DB_USER: process.env.DB_USER || null,
      DB_PASSWORD_type: typeof process.env.DB_PASSWORD,
      DB_PASSWORD_length: process.env.DB_PASSWORD
        ? String(process.env.DB_PASSWORD).length
        : 0,
      DB_PASSWORD_value: process.env.DB_PASSWORD
        ? String(process.env.DB_PASSWORD)
        : null,
      DB_NAME: process.env.DB_NAME || null,
      NODE_ENV: process.env.NODE_ENV || null,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: true, message: (err as Error).message },
      { status: 500 }
    );
  }
}
