-- Migration: Add unique constraint to microsoft_webhook_dedup table
-- Created: 2025-10-05
-- Purpose: Prevent duplicate webhook processing through database-level constraint

-- Add unique constraint to dedup_key column to prevent race conditions
ALTER TABLE microsoft_webhook_dedup
ADD CONSTRAINT microsoft_webhook_dedup_key_unique UNIQUE (dedup_key);

-- Add index for faster lookups (if not already exists)
CREATE INDEX IF NOT EXISTS idx_microsoft_webhook_dedup_created_at
ON microsoft_webhook_dedup(created_at);

COMMENT ON CONSTRAINT microsoft_webhook_dedup_key_unique ON microsoft_webhook_dedup IS 'Ensures each webhook notification is processed only once, preventing duplicates even in race conditions';
