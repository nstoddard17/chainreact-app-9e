-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integrations_user_id_provider_key'
  ) THEN
    ALTER TABLE integrations 
    ADD CONSTRAINT integrations_user_id_provider_key 
    UNIQUE (user_id, provider);
  END IF;
END
$$;

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'status'
  ) THEN
    ALTER TABLE integrations 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'connected';
  END IF;
END
$$;

-- Add scopes column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'scopes'
  ) THEN
    ALTER TABLE integrations 
    ADD COLUMN scopes TEXT[] NULL;
  END IF;
END
$$;

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'integrations' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE integrations 
    ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
  END IF;
END
$$;

-- Add index on user_id and provider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_integrations_user_id_provider'
  ) THEN
    CREATE INDEX idx_integrations_user_id_provider 
    ON integrations(user_id, provider);
  END IF;
END
$$;

-- Fix any duplicate entries
WITH duplicates AS (
  SELECT 
    user_id, 
    provider, 
    MAX(updated_at) as latest_updated_at,
    array_agg(id ORDER BY updated_at DESC) as ids
  FROM integrations
  GROUP BY user_id, provider
  HAVING COUNT(*) > 1
)
DELETE FROM integrations
WHERE id IN (
  SELECT unnest(ids[2:array_length(ids, 1)])
  FROM duplicates
);

-- Show results
SELECT 'Migration completed successfully!' as status;
SELECT COUNT(*) as total_integrations FROM integrations;
SELECT user_id, provider, COUNT(*) as count 
FROM integrations 
GROUP BY user_id, provider 
HAVING COUNT(*) > 1;
