-- Add description column to flow_v2_definitions if it doesn't exist
-- This column is used by the v2 flow API when creating new flows
ALTER TABLE flow_v2_definitions ADD COLUMN IF NOT EXISTS description TEXT;
