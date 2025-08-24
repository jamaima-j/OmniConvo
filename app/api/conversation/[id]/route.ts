import { NextRequest, NextResponse } from 'next/server';
import { getConversationRecord } from '@/lib/db/conversations';
import { s3Client } from '@/lib/storage/s3';
import { loadConfig } from '@/lib/config';
import { createConversationRecord } from '@/lib/db/conversations';
let isInitialized = false;

/**
 * Initialize services if not already initialized
 */
async function ensureInitialized() {
  if (!isInitialized) {
    const config = loadConfig();
    s3Client.initialize(config.s3);
    isInitialized = true;
  }
}

/**
 * GET /api/conversation/[id]
 *
 * Retrieves a signed URL for accessing a conversation's content
 *
 * @param request - The incoming request
 * @param context - Route context containing the conversation ID
 *
 * Response:
 * - 200: { url: string } - The signed URL to access the conversation content
 * - 404: { error: string } - Conversation not found
 * - 500: { error: string } - Server error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await ensureInitialized();
    const id = (await params).id;
    const record = await getConversationRecord(id);
    const signedUrl = await s3Client.getSignedReadUrl(record.contentKey);

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error('Error retrieving conversation:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: 'Internal error, see logs' }, { status: 500 });
  }
}

function genContentKey(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}


export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const blob = form.get('htmlDoc');
    const model = String(form.get('model') ?? 'ChatGPT');

    if (!(blob instanceof Blob)) {
      return NextResponse.json({ error: 'htmlDoc missing' }, { status: 400 });
    }

    const html = await blob.text();
    // We’re not storing HTML here—just metadata your schema already supports
    const sourceHtmlBytes = new TextEncoder().encode(html).length;
    const contentKey = genContentKey();

    const record = await createConversationRecord({
      model,
      scrapedAt: new Date(),
      contentKey,
      sourceHtmlBytes,
      views: 0,
    });

    const base = process.env.NEXT_PUBLIC_BASE_URL ?? new URL(req.url).origin;
    const url = `${base}/c/${record.id}`;

    return NextResponse.json({ id: record.id, url }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}