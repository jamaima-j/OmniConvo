// ========================================
// app/api/conversation/[id]/route.ts
// ========================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { dbClient } from "@/lib/db/client";
import { s3Client } from "@/lib/storage/s3";
import { getConversationRecord } from "@/lib/db/conversations";
import { safeJson } from "@/app/helpers/safeJson";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  await dbClient.initialize();
  try {
    const config = loadConfig();
    s3Client.initialize(config.s3);
  } catch (err) {
    console.error("S3 init failed (GET):", err);
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

type RawRec = {
  id: string | number | bigint;
  model: string;
  scrapedAt: string | Date;
  contentKey: string;
  sourceHtmlBytes: string | number | bigint;
  views: string | number | bigint;
  createdAt: string | Date;
};

function normalizeRec(rec: RawRec) {
  const n = (v: string | number | bigint): number =>
    typeof v === "bigint"
      ? Number(v)
      : typeof v === "string"
      ? Number(v)
      : v;

  return {
    ...rec,
    id: n(rec.id),
    sourceHtmlBytes: n(rec.sourceHtmlBytes),
    views: n(rec.views),
  };
}

export async function GET(request: NextRequest, context: unknown) {
  try {
    await ensureInitialized();

    // safely extract id
    const params = (context as { params?: Record<string, string | string[]> })
      ?.params;
    const rawId = params?.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!id) {
      return safeJson({ error: "Missing conversation id" }, 400, corsHeaders(request));
    }

    const rec = await getConversationRecord(id);

    const raw = request.nextUrl.searchParams.get("raw");
    if (raw === "1" || raw === "true") {
      return safeJson(normalizeRec(rec as RawRec), 200, corsHeaders(request));
    }

    const signedUrl = await s3Client.getSignedReadUrl(
      (rec as RawRec).contentKey
    );
    return safeJson({ url: signedUrl }, 200, corsHeaders(request));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(msg) ? 404 : 500;
    return safeJson({ error: msg }, status, corsHeaders(request));
  }
}
