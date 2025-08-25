// app/c/[id]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

type RouteParams = { id: string };

function toLocalString(d: Date | string | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString();
}

export default async function ConversationPage({ params }: { params: RouteParams }) {
  const id = params.id;

  // fetch metadata (DB row) via API (ensures DB is initialized)
  const metaRes = await fetch(`/api/conversation/${id}?raw=1`, { cache: 'no-store' });
  if (metaRes.status === 404) return notFound();
  if (!metaRes.ok) return notFound();
  const rec = await metaRes.json() as {
    id: number;
    model: string;
    scrapedAt: string;
    sourceHtmlBytes: number;
    contentKey: string;
    createdAt: string;
    views: number;
  };

  // fetch signed URL for the HTML
  const urlRes = await fetch(`/api/conversation/${id}`, { cache: 'no-store' });
  if (!urlRes.ok) return notFound();
  const { url } = await urlRes.json() as { url: string };

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <Card className="shadow-sm border border-gray-200">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-sm underline">← Back to Conversations</Link>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              Open in new tab
            </a>
          </div>

          <h1 className="text-2xl font-bold">Conversation #{rec.id}</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <p><strong>Model:</strong> {rec.model}</p>
            <p><strong>Scraped:</strong> {toLocalString(rec.scrapedAt)}</p>
            <p><strong>Size:</strong> {rec.sourceHtmlBytes} bytes</p>
            <p><strong>Content key:</strong> {rec.contentKey}</p>
          </div>

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
