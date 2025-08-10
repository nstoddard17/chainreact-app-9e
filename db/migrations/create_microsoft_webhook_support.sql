-- Dedup table to prevent reprocessing the same MS Graph notification
CREATE TABLE IF NOT EXISTS microsoft_webhook_dedup (
  dedup_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Queue table for async processing of MS Graph notifications
CREATE TABLE IF NOT EXISTS microsoft_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  subscription_id TEXT,
  resource TEXT,
  change_type TEXT,
  payload JSONB,
  headers JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE microsoft_webhook_queue ENABLE ROW LEVEL SECURITY;

-- Users can see their own queued items
CREATE POLICY IF NOT EXISTS "Users can view own ms queue" ON microsoft_webhook_queue
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage; we rely on service key in server routes.

CREATE INDEX IF NOT EXISTS idx_ms_queue_status_created ON microsoft_webhook_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ms_dedup_created ON microsoft_webhook_dedup(created_at);


