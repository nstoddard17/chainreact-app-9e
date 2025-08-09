-- Stores per-user base ids for providers (e.g., Airtable)
CREATE TABLE IF NOT EXISTS user_bases (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  base_id VARCHAR(64) NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, provider, base_id)
);

ALTER TABLE user_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own user_bases" ON user_bases
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


