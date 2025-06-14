import type { Conversation } from '@/types/conversation';

/**
 * Extracts a DeepSeek share page into a structured Conversation.
 * @param html - Raw HTML content from the DeepSeek share page
 * @returns Promise resolving to a structured Conversation object
 */
export async function parseDeepSeek(html: string): Promise<Conversation> {
  return {
    model: 'DeepSeek',
    content: html,
    scrapedAt: new Date().toISOString(),
    sourceHtmlBytes: html.length,
  };
}
