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
import { loadConfig } from "@/lib/config";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize(): Promise<void> {
  console.log("=== INIT DB + S3 (POST) ===");
  await dbClient.initialize();

  try {
    if (!(s3Client as any).isReady) {
      const config = loadConfig();
      s3Client.initialize(config.s3);
      (s3Client as any).isReady = true;
    }
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("already initialized"))) {
      console.error("S3 init failed (POST):", err);
    }
  }

  isInitialized = true;
}

async function ensureInitialized(): Promise<void> {
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

    // Unique S3 key
    const conversationKey = crypto.randomUUID();

    // Upload HTML to S3
    const key = await s3Client.storeConversation(conversationKey, htmlText);

    // Save DB record
    const saved = await createConversationRecord({
      model,
      contentKey: key,
      scrapedAt: new Date(),
      sourceHtmlBytes: htmlText.length,
      views: 0,
    });

    return safeJson(
      {
        id: saved.id,
        url: `https://jomniconvo.duckdns.org/c/${saved.id}`,
      },
      200,
      corsHeaders(req)
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in POST /api/conversation:", msg);
    return safeJson({ error: msg }, 500, corsHeaders(req));
  }
}
