import type { Conversation } from '@/types/conversation';

/**
 * Extracts a Grok share page into a structured Conversation.
 */
export async function parseGrok(html: string): Promise<Conversation> {
  return {
    model: 'Grok',
    content: html, // store full HTML in content
    scrapedAt: new Date().toISOString(),
    sourceHtmlBytes: html.length,
  };
}
