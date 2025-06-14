import { dbClient } from './client';
import { ConversationRecord, CreateConversationInput } from './types';

/**
 * Creates a new conversation record in the database
 *
 * @param input - The conversation data to store
 * @returns The created conversation record with generated fields
 * @throws Error if database operation fails
 */
export async function createConversationRecord(input: CreateConversationInput): Promise<ConversationRecord> {
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
      scraped_at     AS "scrapedAt",
      content_key    AS "contentKey",
      source_html_bytes AS "sourceHtmlBytes",
      views,
      created_at     AS "createdAt"
  `;

  try {
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
  } catch (error) {
    throw new Error(
      `Failed to create conversation record: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Retrieves a conversation record from the database by ID
 *
 * @param id - The unique identifier of the conversation
 * @returns The conversation record if found
 * @throws Error if database operation fails or record not found
 */
export async function getConversationRecord(id: string): Promise<ConversationRecord> {
  const pool = dbClient.getPool();

  const query = `
    SELECT 
      id,
      model,
      scraped_at as "scrapedAt",
      content_key as "contentKey",
      created_at as "createdAt"
    FROM conversations
    WHERE id = $1
  `;

  try {
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new Error(`Conversation not found with id: ${id}`);
    }

    return result.rows[0] as ConversationRecord;
  } catch (error) {
    throw new Error(`Failed to get conversation record: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
