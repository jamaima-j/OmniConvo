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

// Extend s3Client type so we can mark when it’s ready
interface ExtendedS3Client {
  isReady?: boolean;
  initialize: (config: unknown) => void;
  getSignedReadUrl: (key: string, expiresIn?: number) => Promise<string>;
}
const s3ClientExt = s3Client as ExtendedS3Client;

async function reallyInitialize() {
  console.log("=== INIT DB + S3 (GET) ===");
  await dbClient.initialize();

  try {
    if (!s3ClientExt.isReady) {
      const config = loadConfig();
      s3ClientExt.initialize(config.s3);
      s3ClientExt.isReady = true;
    }
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("already initialized"))) {
      console.error("S3 init failed (GET):", err);
    }
  }

  isInitialized = true;
}

async function ensureInitialized() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = reallyInitialize().catch((e) => {
      initPromise = null;
      isInitialized = false;
      throw e;
    });
  }
  await initPromise;
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
  id: number;
  model: string;
  scrapedAt: string | Date;
  contentKey: string;
  sourceHtmlBytes: number;
  views: number;
  createdAt: string | Date;
};

function normalizeRec(rec: RawRec) {
  return {
    ...rec,
    scrapedAt: new Date(rec.scrapedAt),
    createdAt: new Date(rec.createdAt),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    await ensureInitialized();

    const idStr = context.params.id; // ✅ keep string for DB call
    const rec = await getConversationRecord(idStr); // DB likely expects string

    if (!rec) {
      return safeJson({ error: "Not found" }, 404, corsHeaders(request));
    }

    const raw = request.nextUrl.searchParams.get("raw");
    if (raw === "1" || raw === "true") {
      return safeJson(normalizeRec(rec as unknown as RawRec), 200, corsHeaders(request));
    }

    const signedUrl = await s3ClientExt.getSignedReadUrl(rec.contentKey);
    return safeJson({ url: signedUrl }, 200, corsHeaders(request));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(msg) ? 404 : 500;
    return safeJson({ error: msg }, status, corsHeaders(request));
  }
}
