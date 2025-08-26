// ========================================
// app/api/conversation/[id]/route.ts
// ========================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { loadConfig } from "@/lib/config";
import { dbClient } from "@/lib/db/client";
import { s3Client } from "@/lib/storage/s3";
import { getConversationRecord } from "@/lib/db/conversations";
import { safeJson } from "@/app/helpers/safeJson";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function reallyInitialize() {
  console.log("=== INIT DB + S3 (GET) ===");
  await dbClient.initialize();
  if (!isInitialized) {
    try {
      const config = loadConfig();
      s3Client.initialize(config.s3);
    } catch (err) {
      console.error("S3 init failed (GET):", err);
    }
  }
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
  dbClient.getPool();
}

function corsHeaders(req: NextRequest) {
  const reqHeaders = req.headers.get("access-control-request-headers") ?? "Content-Type";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  try {
    await ensureInitialized();

    // Extract `id` from the pathname: /api/conversation/[id]
    const id = req.nextUrl.pathname.split("/").pop();
    if (!id) {
      return safeJson({ error: "Missing id" }, 400, corsHeaders(req));
    }

    const rec = await getConversationRecord(id);
    if (!rec) {
      return safeJson({ error: "Conversation not found" }, 404, corsHeaders(req));
    }

    const raw = req.nextUrl.searchParams.get("raw");
    if (raw === "1" || raw === "true") {
      return safeJson(rec, 200, corsHeaders(req));
    }

    const signedUrl = await s3Client.getSignedReadUrl(rec.contentKey);
    return safeJson({ url: signedUrl }, 200, corsHeaders(req));
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(msg) ? 404 : 500;
    console.error("Error in GET /api/conversation/[id]:", msg);
    return safeJson({ error: msg }, status, corsHeaders(req));
  }
}
