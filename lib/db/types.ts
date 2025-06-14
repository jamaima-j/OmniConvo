export interface ConversationRecord {
  /** Unique identifier for the conversation */
  id: string;

  /** The AI model used (e.g., "ChatGPT", "Claude", etc.) */
  model: string;

  /** Timestamp when the conversation was scraped */
  scrapedAt: Date;

  /** S3 key where the conversation content is stored */
  contentKey: string;

  /** When the record was created */
  createdAt: Date;

  /** Number of bytes in the source HTML */
  sourceHtmlBytes: number;

  /** Number of views of the conversation */
  views: number;
}

/**
 * Input type for creating a new conversation record
 */
export type CreateConversationInput = Omit<ConversationRecord, 'id' | 'createdAt'>;

/**
 * Database configuration type
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}
