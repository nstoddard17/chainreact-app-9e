-- Create AI cost tracking tables

-- Table for detailed cost logs
CREATE TABLE IF NOT EXISTS ai_cost_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feature VARCHAR(50) NOT NULL, -- 'ai_assistant', 'ai_compose', 'ai_agent'
  model VARCHAR(50) NOT NULL, -- 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost DECIMAL(10,6) NOT NULL,
  calculated_cost DECIMAL(10,6) NOT NULL,
  metadata JSONB, -- Additional context like prompt length, response length, etc.
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for monthly cost aggregation
CREATE TABLE IF NOT EXISTS monthly_ai_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  total_cost DECIMAL(10,6) DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  ai_assistant_cost DECIMAL(10,6) DEFAULT 0,
  ai_compose_cost DECIMAL(10,6) DEFAULT 0,
  ai_agent_cost DECIMAL(10,6) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_cost_logs_user_id ON ai_cost_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_cost_logs_timestamp ON ai_cost_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_cost_logs_feature ON ai_cost_logs(feature);
CREATE INDEX IF NOT EXISTS idx_monthly_ai_costs_user_id ON monthly_ai_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_ai_costs_year_month ON monthly_ai_costs(year, month);

-- RLS Policies for ai_cost_logs
ALTER TABLE ai_cost_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI cost logs" ON ai_cost_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI cost logs" ON ai_cost_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for monthly_ai_costs
ALTER TABLE monthly_ai_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monthly AI costs" ON monthly_ai_costs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own monthly AI costs" ON monthly_ai_costs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monthly AI costs" ON monthly_ai_costs
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to automatically update monthly costs when new cost logs are inserted
CREATE OR REPLACE FUNCTION update_monthly_ai_costs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO monthly_ai_costs (user_id, year, month, total_cost, total_tokens, ai_assistant_cost, ai_compose_cost, ai_agent_cost)
  VALUES (
    NEW.user_id,
    EXTRACT(YEAR FROM NEW.timestamp),
    EXTRACT(MONTH FROM NEW.timestamp),
    NEW.cost,
    NEW.input_tokens + NEW.output_tokens,
    CASE WHEN NEW.feature = 'ai_assistant' THEN NEW.cost ELSE 0 END,
    CASE WHEN NEW.feature = 'ai_compose' THEN NEW.cost ELSE 0 END,
    CASE WHEN NEW.feature = 'ai_agent' THEN NEW.cost ELSE 0 END
  )
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET
    total_cost = monthly_ai_costs.total_cost + NEW.cost,
    total_tokens = monthly_ai_costs.total_tokens + NEW.input_tokens + NEW.output_tokens,
    ai_assistant_cost = monthly_ai_costs.ai_assistant_cost + CASE WHEN NEW.feature = 'ai_assistant' THEN NEW.cost ELSE 0 END,
    ai_compose_cost = monthly_ai_costs.ai_compose_cost + CASE WHEN NEW.feature = 'ai_compose' THEN NEW.cost ELSE 0 END,
    ai_agent_cost = monthly_ai_costs.ai_agent_cost + CASE WHEN NEW.feature = 'ai_agent' THEN NEW.cost ELSE 0 END,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update monthly costs
CREATE TRIGGER trigger_update_monthly_ai_costs
  AFTER INSERT ON ai_cost_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_ai_costs(); 