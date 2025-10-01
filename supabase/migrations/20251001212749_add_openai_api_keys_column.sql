-- Add openai_api_keys column to user_profiles table
-- This stores encrypted OpenAI API keys for users who want to use their own keys

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS openai_api_keys JSONB DEFAULT '[]'::JSONB;

-- Add default_openai_model column to store user's preferred model
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS default_openai_model TEXT DEFAULT 'gpt-4o-mini';

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.openai_api_keys IS 'Encrypted OpenAI API keys - array of objects with id, name, key_encrypted, key_preview, created_at';
COMMENT ON COLUMN user_profiles.default_openai_model IS 'Default OpenAI model to use (e.g., gpt-4o-mini, gpt-4o)';
