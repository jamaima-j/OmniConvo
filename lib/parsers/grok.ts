import type { Conversation } from '@/types/conversation';

/**
 * Extracts a Grok share page into a structured Conversation.
 * @param html - Raw HTML content from the Grok share page
 * @returns Promise resolving to a structured Conversation object
 */
export async function parseGrok(html: string): Promise<Conversation> {
  return {
    model: 'Grok',
    content: html,
    scrapedAt: new Date().toISOString(),
    sourceHtmlBytes: html.length,
  };
}
