import type { Conversation } from '@/types/conversation';

/**
 * Extracts a Perplexity share page into a structured Conversation.
 * @param html - Raw HTML content from the Perplexity share page
 * @returns Promise resolving to a structured Conversation object
 */
export async function parsePerplexity(html: string): Promise<Conversation> {
  return {
    model: 'Perplexity',
    content: html,
    scrapedAt: new Date().toISOString(),
    sourceHtmlBytes: html.length,
  };
}
