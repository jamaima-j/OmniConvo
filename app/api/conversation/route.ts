import { NextRequest, NextResponse } from 'next/server';
import { parseHtmlToConversation } from '@/lib/parsers';
import { dbClient } from '@/lib/db/client';
import { s3Client } from '@/lib/storage/s3';
import { CreateConversationInput } from '@/lib/db/types';
import { createConversationRecord } from '@/lib/db/conversations';
import { randomUUID } from 'crypto';
import { loadConfig } from '@/lib/config';


export const runtime = 'nodejs';              // ensure Node runtime (not edge)
export const dynamic = 'force-dynamic'; 

let isInitialized = false;

/**
 * Initialize services if not already initialized
 */
async function ensureInitialized() {
  if (!isInitialized) {
    const config = loadConfig();
    await dbClient.initialize(config.database);
    s3Client.initialize(config.s3);
    isInitialized = true;
  }
}
// cors helper refelect requests headers and no credentials
function corsHeaders(req: NextRequest) {
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  // Preflight handler
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}


/**
 * POST /api/conversation
 *
 * Handles storing a new conversation from HTML input
 *
 * Request body (multipart/form-data):
 * - htmlDoc: File - The HTML document containing the conversation
 * - model: string - The AI model used (e.g., "ChatGPT", "Claude")
 *
 * Response:
 * - 201: { url: string } - The permalink URL for the conversation
 * - 400: { error: string } - Invalid request
 * - 500: { error: string } - Server error
 */
export async function POST(req: NextRequest) {
  try {
    // Initialize services on first request
    await ensureInitialized();

    const formData = await req.formData();
    const file = formData.get('htmlDoc');
    const model = formData.get('model')?.toString() ?? 'ChatGPT';

    // Validate input
    if (!(file instanceof Blob)) {
  return NextResponse.json(
    { error: '`htmlDoc` must be a file field' },
    { status: 400,  headers: corsHeaders(req) }
  );
}

    // Parse the conversation from HTML
    const html = await (file as Blob).text();
    if (html.length > 5_000_000) { // ~5MB
      return NextResponse.json(
        { error: 'HTML too large' },
        { status: 413, headers: corsHeaders(req) }
      );
    }



    let conversation;
    try {
      conversation = await parseHtmlToConversation(html, model);
    } catch (e: any) {
      console.error('parseHtmlToConversation failed:', e);
      return NextResponse.json(
        { error: 'Parse failed', detail: String(e?.message || e) },
        { status: 400, headers: corsHeaders(req) }
      );
    }
    // Generate a unique ID for the conversation
    const conversationId = randomUUID();

    // Store only the conversation content in S3
    const contentKey = await s3Client.storeConversation(conversationId, conversation.content);

    // Create the database record with metadata
    const dbInput: CreateConversationInput = {
      model: conversation.model,
      scrapedAt: new Date(conversation.scrapedAt),
      sourceHtmlBytes: conversation.sourceHtmlBytes,
      views: 0,
      contentKey,
    };

    const record = await createConversationRecord(dbInput);

    // Generate the permalink using the database-generated ID
    const permalink = `${process.env.NEXT_PUBLIC_BASE_URL}/c/${record.id}`;

    return NextResponse.json(
      { url: permalink },
       { status: 201, headers: corsHeaders(req) }             //add CORS on success
    );
  } catch (err) {
  console.error('Error processing conversation:', err);
  return NextResponse.json(
    { error: 'Internal error, see logs' },
    { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}
}
