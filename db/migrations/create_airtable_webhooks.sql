-- Tracks Airtable webhook registrations per user/base
CREATE TABLE IF NOT EXISTS airtable_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  base_id VARCHAR(64) NOT NULL,
  webhook_id VARCHAR(128) NOT NULL,
  mac_secret_base64 TEXT NOT NULL,
  expiration_time TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expired','error','inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, base_id, webhook_id)
);

ALTER TABLE airtable_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Airtable webhooks" ON airtable_webhooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Airtable webhooks" ON airtable_webhooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Airtable webhooks" ON airtable_webhooks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Airtable webhooks" ON airtable_webhooks
  FOR DELETE USING (auth.uid() = user_id);


