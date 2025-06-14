-- Initial schema for AI Archives application

-- 1) Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2) Table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model VARCHAR(50) NOT NULL,
    scraped_at TIMESTAMPTZ NOT NULL,
    content_key VARCHAR(255) NOT NULL,
    source_html_bytes INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_source_html_bytes CHECK (source_html_bytes > 0),
    CONSTRAINT non_negative_views CHECK (views >= 0)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_model      ON conversations(model);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();