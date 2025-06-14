import type { Conversation } from '@/types/conversation';
import { parseChatGPT } from './chatgpt';
import { parseGemini } from './gemini';
import { parseClaude } from './claude';
import { parseMeta } from './meta';
import { parsePerplexity } from './perplexity';
import { parseGrok } from './grok';
import { parseDeepSeek } from './deepseek';
import { parseCopilot } from './copilot';

/**
 * Main entry used by the API route.
 * @param html      Raw HTML from the extension
 * @param model     model name passed by the extension
 */
export async function parseHtmlToConversation(html: string, input: string): Promise<Conversation> {
  const model = input.toLowerCase();
  switch (model) {
    case 'chatgpt':
    case 'gpt':
      return parseChatGPT(html);

    case 'gemini':
    case 'bard':
      return parseGemini(html);

    case 'claude':
      return parseClaude(html);

    case 'meta':
      return parseMeta(html);

    case 'perplexity':
      return parsePerplexity(html);

    case 'grok':
      return parseGrok(html);

    case 'deepseek':
      return parseDeepSeek(html);

    case 'copilot':
      return parseCopilot(html);

    default:
      throw new Error(`Unsupported or unknown model: ${model}`);
  }
}
