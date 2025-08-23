// @ts-nocheck

import { getConversationRecord } from '@/lib/db/conversations';
import { s3Client } from '@/lib/storage/s3';

export default async function ConversationPage({ params }) {
  const record = await getConversationRecord(params.id);

  if (!record) {
    return <div className="p-6">Conversation not found.</div>;
  }

  let signedUrl = null;
  try {
    signedUrl = await s3Client.getSignedReadUrl(record.contentKey);
  } catch (err) {
    console.error('Error generating signed URL:', err);
  }

  if (!signedUrl) {
    return <div className="p-6">Failed to load conversation content.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Conversation #{record.id}</h1>
      <p><strong>Model:</strong> {record.model}</p>
      <p><strong>Scraped:</strong> {new Date(record.scrapedAt).toLocaleString()}</p>

      <h2 className="text-xl font-semibold">Conversation:</h2>
      <iframe
        src={signedUrl}
        className="w-full h-[80vh] border rounded"
        title="Conversation Content"
      />
    </div>
  );
}
