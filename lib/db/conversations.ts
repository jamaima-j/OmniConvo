// lib/db/conversations.ts
import { dbClient } from './client';
import { ConversationRecord, CreateConversationInput } from './types';

/**
 * Creates a new conversation record in the database
 */
export async function createConversationRecord(
  input: CreateConversationInput
): Promise<ConversationRecord> {
  const pool = dbClient.getPool();

  const query = `
    INSERT INTO conversations (
      model,
      scraped_at,
      content_key,
      source_html_bytes,
      views
    ) VALUES (
      $1, $2, $3, $4, $5
    )
    RETURNING
      id,
      model,
      scraped_at         AS "scrapedAt",
      content_key        AS "contentKey",
      source_html_bytes  AS "sourceHtmlBytes",
      views,
      created_at         AS "createdAt"
  `;

  const result = await pool.query(query, [
    input.model,
    input.scrapedAt,
    input.contentKey,
    input.sourceHtmlBytes,
    input.views,
  ]);

  if (result.rows.length === 0) {
    throw new Error('Failed to create conversation record - no rows returned');
  }
  return result.rows[0] as ConversationRecord;
}

/**
 * Retrieves a conversation record by ID
 */
export async function getConversationRecord(id: string): Promise<ConversationRecord> {
  const pool = dbClient.getPool();


  const sql = `
    SELECT 
      id,
      model,
      scraped_at         AS "scrapedAt",
      content_key        AS "contentKey",
      source_html_bytes  AS "sourceHtmlBytes",
      views,
      created_at         AS "createdAt"
    FROM conversations
    WHERE id::text = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(sql, [String(id)]);
  if (rows.length === 0) {
    throw new Error(`Conversation not found with id: ${id}`);
  }
  return rows[0] as ConversationRecord;
}

export type ConversationListItem = {
  id: number;
  model: string;
  scrapedAt: string;
  contentKey: string;
  sourceHtmlBytes: number;
  views: number;
  createdAt: string;
};

/**
 * Lists recent conversations
 */
export async function listRecentConversations(limit = 24): Promise<ConversationListItem[]> {
  const pool = dbClient.getPool();
  const sql = `
    SELECT 
      id,
      model,
      scraped_at        AS "scrapedAt",
      content_key       AS "contentKey",
      source_html_bytes AS "sourceHtmlBytes",
      views,
      created_at        AS "createdAt"
    FROM conversations
    ORDER BY id DESC
    LIMIT $1
  `;
  const { rows } = await pool.query(sql, [limit]);
  return rows as ConversationListItem[];
}
