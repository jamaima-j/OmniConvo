import Link from 'next/link';

type RouteParams = { id: string };

export default async function ConversationPage({
  params,
}: { params: Promise<RouteParams> }) {
  const { id } = await params;

  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/conversation/${id}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return <div className="p-6">Conversation not found.</div>;
  }

  const { url, model, scrapedAt } = await res.json() as {
    url: string; model: string; scrapedAt: string;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm underline">← Back to Conversations</Link>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
          Open in new tab
        </a>
      </div>

      <h1 className="text-2xl font-bold">Conversation #{id}</h1>
      <p><strong>Model:</strong> {model}</p>
      <p><strong>Scraped:</strong> {new Date(scrapedAt).toLocaleString()}</p>

      <iframe
        src={url}
        className="w-full h-[80vh] border rounded"
        title="Conversation Content"
      />
    </div>
  );
}
