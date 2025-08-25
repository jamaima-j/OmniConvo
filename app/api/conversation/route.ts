// ========================================
// app/api/conversation/route.ts  
// ========================================
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { loadConfig } from '@/lib/config';
import { dbClient } from '@/lib/db/client';
import { s3Client } from '@/lib/storage/s3';
import { parseHtmlToConversation } from '@/lib/parsers';
import { createConversationRecord } from '@/lib/db/conversations';
import type { CreateConversationInput } from '@/lib/db/types';
import { safeJson } from '@/app/helpers/safeJson';

// -------- robust one-time init (per route bundle) ----------
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
    // Continue anyway since database is what matters
  }
  
  isInitialized = true;
  console.log('=== INITIALIZATION COMPLETE (POST) ===');
}

async function ensureInitialized() {
  if (isInitialized) {
    try {
      dbClient.getPool(); // sanity check: throws if not ready
      return;
    } catch (error) {
      console.log('Pool check failed (POST), reinitializing:', error);
      isInitialized = false;
    }
  }
  if (!initPromise) {
    initPromise = reallyInitialize().catch((e) => {
      console.error('POST route initialization failed:', e);
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
    console.error('Final pool check failed (POST):', error);
    isInitialized = false;
    throw new Error('Database client not initialized');
  }
}

// -------- CORS ----------
function corsHeaders(req: NextRequest) {
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/**
 * POST /api/conversation
 * multipart/form-data:
 *  - htmlDoc: File
 *  - model: string
 * returns: { id, url }
 */
export async function POST(req: NextRequest) {
  try {
    console.log('=== POST /api/conversation START ===');
    await ensureInitialized();
    console.log('POST route initialized successfully');

    const form = await req.formData();
    const file = form.get('htmlDoc');
    const model = form.get('model')?.toString() ?? 'ChatGPT';

    if (!(file instanceof Blob)) {
      return safeJson({ error: '`htmlDoc` must be a file field' }, 400, corsHeaders(req));
    }

    const html = await (file as Blob).text();
    if (html.length > 5_000_000) {
      return safeJson({ error: 'HTML too large' }, 413, corsHeaders(req));
    }

    // Parse to structured content
    const parsed = await parseHtmlToConversation(html, model);

    // Store content in S3 (keyed by UUID)
    const conversationId = randomUUID();
    const contentKey = await s3Client.storeConversation(conversationId, parsed.content);

    // Create DB record (metadata only)
    const input: CreateConversationInput = {
      model: parsed.model,
      scrapedAt: new Date(parsed.scrapedAt),
      sourceHtmlBytes: parsed.sourceHtmlBytes,
      views: 0,
      contentKey,
    };
    
    console.log('Creating conversation record...');
    const record = await createConversationRecord(input);
    console.log('Conversation record created successfully');

    // Permalink
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(req.url).origin;
    const idVal =
      typeof (record as any).id === 'bigint' ? Number((record as any).id) : (record as any).id;
    const url = `${base}/c/${idVal}`;

    console.log('=== POST /api/conversation SUCCESS ===');
    return safeJson({ id: idVal, url }, 201, corsHeaders(req));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('=== POST /api/conversation ERROR ===');
    console.error('Error:', detail);
    console.error('Stack:', err instanceof Error ? err.stack : 'No stack');
    return safeJson({ error: 'Internal error, see logs', detail }, 500, corsHeaders(req));
  }
}