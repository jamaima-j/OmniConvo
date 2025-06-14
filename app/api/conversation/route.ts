import { NextRequest, NextResponse } from 'next/server';
import { parseHtmlToConversation } from '@/lib/parsers';
import { dbClient } from '@/lib/db/client';
import { s3Client } from '@/lib/storage/s3';
import { CreateConversationInput } from '@/lib/db/types';
import { createConversationRecord } from '@/lib/db/conversations';
import { randomUUID } from 'crypto';
import { loadConfig } from '@/lib/config';

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

const ALLOWED_ORIGIN = '*';

export async function OPTIONS() {
  // Preflight handler
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
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
      return NextResponse.json({ error: '`htmlDoc` must be a file field' }, { status: 400 });
    }

    // Parse the conversation from HTML
    const html = await file.text();
    const conversation = await parseHtmlToConversation(html, model);

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
      {
        status: 201,
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      }
    );
  } catch (err) {
    console.error('Error processing conversation:', err);
    return NextResponse.json({ error: 'Internal error, see logs' }, { status: 500 });
  }
}
