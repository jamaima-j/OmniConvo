// ========================================
// app/api/conversation/route.ts
// ========================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadConfig } from "@/lib/config";
import { dbClient } from "@/lib/db/client";
import { s3Client } from "@/lib/storage/s3";
import { parseHtmlToConversation } from "@/lib/parsers";
import { createConversationRecord } from "@/lib/db/conversations";
import type { CreateConversationInput } from "@/lib/db/types";
import { safeJson } from "@/app/helpers/safeJson";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  console.log("=== INIT DB + S3 (POST) ===");
  await dbClient.initialize();
  try {
    const config = loadConfig();
    s3Client.initialize(config.s3);
  } catch (err) {
    console.error("S3 init failed (POST):", err);
  }
  isInitialized = true;
}

async function ensureInitialized() {
  if (isInitialized) {
    try {
      dbClient.getPool();
      return;
    } catch {
      isInitialized = false;
    }
  }
  if (!initPromise) {
    initPromise = reallyInitialize().catch((e) => {
      initPromise = null;
      isInitialized = false;
      throw e;
    });
  }
  await initPromise;
  dbClient.getPool();
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

    const form = await req.formData();
    const file = form.get("htmlDoc");
    const model = form.get("model")?.toString() ?? "ChatGPT";

    if (!(file instanceof Blob)) {
      return safeJson(
        { error: "`htmlDoc` must be a file field" },
        400,
        corsHeaders(req)
      );
    }

    const html = await file.text();
    if (html.length > 5_000_000) {
      return safeJson({ error: "HTML too large" }, 413, corsHeaders(req));
    }

    const parsed = await parseHtmlToConversation(html, model);

    const conversationId = randomUUID();
    const contentKey = await s3Client.storeConversation(
      conversationId,
      parsed.content
    );

    const input: CreateConversationInput = {
      model: parsed.model,
      scrapedAt: new Date(parsed.scrapedAt),
      sourceHtmlBytes: parsed.sourceHtmlBytes,
      views: 0,
      contentKey,
    };

    const record = await createConversationRecord(input);

    const base =
      process.env.NEXT_PUBLIC_BASE_URL ?? new URL(req.url).origin;

    // type-safe id conversion
    const rawId = (record as { id: string | number | bigint }).id;
    const idVal =
      typeof rawId === "bigint"
        ? Number(rawId)
        : typeof rawId === "string"
        ? parseInt(rawId, 10)
        : rawId;

    const url = `${base}/c/${idVal}`;

    return safeJson({ id: idVal, url }, 201, corsHeaders(req));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return safeJson(
      { error: "Internal error, see logs", detail },
      500,
      corsHeaders(req)
    );
  }
}
