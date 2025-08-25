// ========================================
// app/api/conversation/route.ts
// ========================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { dbClient } from "@/lib/db/client";
import { s3Client } from "@/lib/storage/s3";
import { createConversationRecord } from "@/lib/db/conversations";
import { safeJson } from "@/app/helpers/safeJson";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  console.log("=== INIT DB + S3 (POST) ===");
  await dbClient.initialize();
  isInitialized = true;
}

async function ensureInitialized() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = reallyInitialize().catch((err) => {
      initPromise = null;
      isInitialized = false;
      throw err;
    });
  }
  await initPromise;
}

function corsHeaders(req: NextRequest) {
  const reqHeaders =
    req.headers.get("access-control-request-headers") ?? "Content-Type";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: NextRequest) {
  try {
    await ensureInitialized();

    const formData = await req.formData();
    const htmlFile = formData.get("htmlDoc");
    const model = String(formData.get("model") || "unknown");

    if (!(htmlFile instanceof Blob)) {
      return safeJson({ error: "Missing htmlDoc" }, 400, corsHeaders(req));
    }

    const htmlText = await htmlFile.text();

    // Generate unique ID for conversation
    const conversationId = crypto.randomUUID();

    // Upload to S3
    const key = await s3Client.storeConversation(conversationId, htmlText);

    // Save DB record (match CreateConversationInput type)
    const saved = await createConversationRecord({
      model,
      contentKey: key,
      scrapedAt: new Date(),
      sourceHtmlBytes: htmlText.length,
      views: 0,
    });

    const url = `/c/${saved.id}`;

    return safeJson({ id: saved.id, url }, 200, corsHeaders(req));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in POST /api/conversation:", msg);
    return safeJson({ error: msg }, 500, corsHeaders(req));
  }
}
