// app/c/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

type Params = { id: string };

function fmtBytes(n?: number | null): string {
  if (!n || n <= 0) return "0 bytes";
  const k = 1024;
  const sizes = ["bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(0)} ${sizes[i]}`;
}
function toLocalString(d?: string | Date | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleString();
}

export default async function Page(props: { params: Promise<Params> }) {
  const { id } = await props.params;
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";

  const metaRes = await fetch(`${base}/api/conversation/${id}?raw=1`, { cache: "no-store" });
  if (metaRes.status === 404) return notFound();
  if (!metaRes.ok) return notFound();

  type Rec = {
    id: number;
    model: string | null;
    scrapedAt: string | null;
    contentKey: string;
    sourceHtmlBytes: number | null;
    createdAt: string | null;
    views: number | null;
  };
  const rec = (await metaRes.json()) as Rec;

  const urlRes = await fetch(`${base}/api/conversation/${id}`, { cache: "no-store" });
  if (!urlRes.ok) return notFound();
  const { url } = (await urlRes.json()) as { url: string };

  const model = rec.model || "Grok";
  const scrapedAtText = toLocalString(rec.scrapedAt || rec.createdAt);
  const prettySize = fmtBytes(rec.sourceHtmlBytes);

  return (
    <main className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Conversations
        </Link>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">Conversation #{String(id)}</h1>
              <p className="mt-1 text-xs text-gray-500">
                Model: {model} &nbsp;&middot;&nbsp; Scraped: {scrapedAtText} &nbsp;&middot;&nbsp; Size: {prettySize}
              </p>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
              Open raw HTML
            </a>
          </div>

          <span className="mt-3 inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            Source: Grok
          </span>
        </div>
      </div>

      <Card className="mt-4 shadow-sm border border-gray-200">
        <CardContent className="p-0">
          <style
            dangerouslySetInnerHTML={{
              __html:
                `.viewer iframe{width:100%;height:80vh;border:0}` +
                `@media (max-width:768px){.viewer iframe{height:70vh}}`,
            }}
          />
          <div className="viewer">
            <iframe src={url} title={`conversation-${String(rec.id)}`} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
