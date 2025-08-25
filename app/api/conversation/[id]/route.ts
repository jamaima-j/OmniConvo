// ========================================
// app/api/conversation/[id]/route.ts
// ========================================
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config';
import { dbClient } from '@/lib/db/client';
import { s3Client } from '@/lib/storage/s3';
import { getConversationRecord } from '@/lib/db/conversations';
import { safeJson } from '@/app/helpers/safeJson';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  console.log('=== BYPASS CONFIG INITIALIZATION ===');
  
  // Initialize database WITHOUT using config
  console.log('Initializing database client directly...');
  await dbClient.initialize(); // Use environment variables directly
  
  // Still use config for S3 since that's probably working
  try {
    const config = loadConfig();
    s3Client.initialize(config.s3);
    console.log('S3 initialized from config');
  } catch (configError) {
    console.error('Config loading failed, but database should still work:', configError);
    // Continue anyway since database is what matters for this route
  }
  
  isInitialized = true;
  console.log('=== INITIALIZATION COMPLETE (GET) ===');
}

async function ensureInitialized() {
  if (isInitialized) {
    try {
      dbClient.getPool(); // throws if not ready
      return;
    } catch (error) {
      console.log('Pool check failed (GET), reinitializing:', error);
      isInitialized = false;
    }
  }
  if (!initPromise) {
    initPromise = reallyInitialize().catch((e) => {
      console.error('GET route initialization failed:', e);
      initPromise = null;
      isInitialized = false;
      throw e;
    });
  }
  await initPromise;

  // final guard
  try {
    dbClient.getPool();
  } catch (error) {
    console.error('Final pool check failed (GET):', error);
    isInitialized = false;
    throw new Error('Database client not initialized');
  }
}

// CORS
function corsHeaders(req: NextRequest) {
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

function normalizeRec(rec: any) {
  const n = (v: any) => (typeof v === 'bigint' ? Number(v) : v);
  return { ...rec, id: n(rec.id), sourceHtmlBytes: n(rec.sourceHtmlBytes), views: n(rec.views) };
}

/**
 * GET /api/conversation/[id]
 *  - ?raw=1|true -> returns the DB row
 *  - else        -> { url: <signed-read-url> } from S3
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    console.log('=== GET /api/conversation/[id] START ===');
    console.log('Request params:', params);
    
    await ensureInitialized();
    console.log('GET route initialized successfully');

    console.log('Fetching conversation record...');
    const rec = await getConversationRecord(params.id);
    console.log('Got conversation record');

    const raw = request.nextUrl.searchParams.get('raw');
    if (raw === '1' || raw === 'true') {
      console.log('Returning raw record');
      return safeJson(normalizeRec(rec), 200, corsHeaders(request));
    }

    console.log('Getting signed URL from S3');
    const signedUrl = await s3Client.getSignedReadUrl(rec.contentKey);
    console.log('=== GET /api/conversation/[id] SUCCESS ===');
    return safeJson({ url: signedUrl }, 200, corsHeaders(request));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = /not found/i.test(msg) ? 404 : 500;
    console.error('=== GET /api/conversation/[id] ERROR ===');
    console.error('Error retrieving conversation:', error);
    console.error('Error message:', msg);
    return safeJson({ error: msg }, status, corsHeaders(request));
  }
}