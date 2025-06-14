import type { Conversation } from '@/types/conversation';

/**
 * Extracts a Gemini share page into a structured Conversation.
 */
export async function parseGemini(html: string): Promise<Conversation> {
  return {
    model: 'Gemini',
    content: html,
    scrapedAt: new Date().toISOString(),
    sourceHtmlBytes: html.length,
  };
}
