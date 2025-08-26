// app/c/[id]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';

type Params = { id: string };

// Utility
function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '0 bytes';
  const k = 1024;
  const sizes = ['bytes','KB','MB','GB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(0)} ${sizes[i]}`;
}
function toLocalString(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString();
}

export default async function Page(props: { params: Promise<Params> }) {
  const { id } = await props.params;

  // 1) fetch metadata
  const metaRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/conversation/${id}?raw=1`, { cache: 'no-store' });
  if (metaRes.status === 404) return notFound();
  if (!metaRes.ok) return notFound();

  const rec = (await metaRes.json()) as {
    id: number;
    model: string;
    scrapedAt: string;
    contentKey: string;
    sourceHtmlBytes: number;
    createdAt: string;
    views: number;
  };

  // 2) signed URL
  const urlRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/conversation/${id}`, { cache: 'no-store' });
  if (!urlRes.ok) return notFound();
  const { url } = (await urlRes.json()) as { url: string };

  return (
    <main className="container mx-auto max-w-4xl px-4 py-6">
      {/* small top bar only */}
      <div className="flex items-center justify-between mb-3">
        <Link href="/" className="text-sm underline">← Back to Conversations</Link>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open raw HTML</a>
      </div>

      {/* slim meta row */}
      <div className="text-xs text-gray-500 mb-2 flex gap-4">
        <span><strong>Model:</strong> {rec.model}</span>
        <span><strong>Scraped:</strong> {toLocalString(rec.scrapedAt)}</span>
        <span><strong>Size:</strong> {fmtBytes(rec.sourceHtmlBytes)}</span>
      </div>

      {/* viewer */}
      <Card className="shadow-sm border border-gray-200">
        <CardContent className="p-0">
          <style
            // minimal CSS so code blocks look nice
            dangerouslySetInnerHTML={{
              __html: `
                .viewer iframe{ width:100%; height:80vh; border:0; }
                @media (max-width: 768px){ .viewer iframe{ height:70vh; } }
              `
            }}
          />
          <div className="viewer">
            <iframe src={url} title={'conversation-' + rec.id} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
