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

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  console.log('=== BYPASS CONFIG INITIALIZATION ===');
  await dbClient.initialize();

  try {
    const config = loadConfig();
    s3Client.initialize(config.s3);
    console.log('S3 initialized from config');
  } catch (configError) {
    console.error('Config loading failed, DB should still work:', configError);
  }

  isInitialized = true;
  console.log('=== INITIALIZATION COMPLETE (POST) ===');
}

async function ensureInitialized() {
  if (isInitialized) {
    try {
      dbClient.getPool();
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

  try {
    dbClient.getPool();
  } catch (error) {
    console.error('Final pool check failed (POST):', error);
    isInitialized = false;
    throw new Error('Database client not initialized');
  }
}

// CORS
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

    const parsed = await parseHtmlToConversation(html, model);

    const conversationId = randomUUID();
    const contentKey = await s3Client.storeConversation(conversationId, parsed.content);

    const input: CreateConversationInput = {
      model: parsed.model,
      scrapedAt: new Date(parsed.scrapedAt),
      sourceHtmlBytes: parsed.sourceHtmlBytes,
      views: 0,
      contentKey,
    };

    const record = await createConversationRecord(input);

    // ✅ Fix: allow string | number | bigint
    const rawId: string | number | bigint = record.id as string | number | bigint;
    const idVal: number | string =
      typeof rawId === 'bigint'
        ? Number(rawId)
        : typeof rawId === 'string'
        ? Number(rawId)
        : rawId;

    const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(req.url).origin;
    const url = `${base}/c/${idVal}`;

    console.log('=== POST /api/conversation SUCCESS ===', { id: idVal, url });
    return safeJson({ id: idVal, url }, 201, corsHeaders(req));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('=== POST /api/conversation ERROR ===', detail);
    return safeJson({ error: 'Internal error, see logs', detail }, 500, corsHeaders(req));
  }
}
