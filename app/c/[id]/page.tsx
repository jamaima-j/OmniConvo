// ========================================
// app/c/[id]/page.tsx
// ========================================
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type RouteParams = { id: string };

export default async function ConversationPage({
  params,
}: {
  params: RouteParams;
}) {
  const id = params.id;

  // Fetch metadata (DB row)
  const metaRes = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/conversation/${id}?raw=1`,
    { cache: "no-store" }
  );
  if (metaRes.status === 404) return notFound();
  if (!metaRes.ok) return notFound();

  const rec = (await metaRes.json()) as {
    id: number;
    model: string;
    scrapedAt: string;
    contentKey: string;
    createdAt: string;
    views: number;
  };

  // Fetch signed URL for iframe
  const urlRes = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/conversation/${id}`,
    { cache: "no-store" }
  );
  if (!urlRes.ok) return notFound();
  const { url } = (await urlRes.json()) as { url: string };

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <Card className="shadow-sm border border-gray-200">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-sm underline">
              ← Back to Conversations
            </Link>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              Open in new tab
            </a>
          </div>

          <h1 className="text-2xl font-bold">
            Conversation #{rec.id} <span className="text-gray-500">({rec.model})</span>
          </h1>

          <iframe
            src={url}
            className="w-full h-[80vh] border rounded"
            title={`conversation-${rec.id}`}
          />
        </CardContent>
      </Card>
    </main>
  );
}
