import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration(migrationName, sqlStatements) {
  console.log(`\n🔄 Running migration: ${migrationName}`)
  
  try {
    // Split SQL statements and execute each one
    const statements = sqlStatements.split(';').filter(stmt => stmt.trim())
    
    for (const statement of statements) {
      if (statement.trim()) {
        const { error } = await supabase.from('_dummy').select('*').limit(0)
        // We'll use a different approach - let's just log the SQL for manual execution
        console.log(`📝 SQL Statement: ${statement.trim()}`)
      }
    }
    
    console.log(`✅ Migration ${migrationName} SQL prepared for manual execution`)
    return true
  } catch (error) {
    console.error(`❌ Failed to prepare ${migrationName}:`, error.message)
    return false
  }
}

async function runMigrations() {
  console.log('🚀 Starting AI migrations...')
  console.log('📋 Since exec_sql function is not available, here are the SQL statements to run manually:')
  
  // Migration 1: AI Usage Limits
  const aiUsageLimitsSQL = `
    -- Add AI usage tracking to monthly_usage table
    ALTER TABLE monthly_usage 
    ADD COLUMN IF NOT EXISTS ai_assistant_calls INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_compose_uses INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_agent_executions INTEGER DEFAULT 0;

    -- Add AI limits to plans table
    ALTER TABLE plans 
    ADD COLUMN IF NOT EXISTS max_ai_assistant_calls INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_ai_compose_uses INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_ai_agent_executions INTEGER DEFAULT 0;

    -- Update existing plans with AI limits
    UPDATE plans SET 
      max_ai_assistant_calls = 5,
      max_ai_compose_uses = 5,
      max_ai_agent_executions = 5
    WHERE name = 'Free';

    UPDATE plans SET 
      max_ai_assistant_calls = 20,
      max_ai_compose_uses = 20,
      max_ai_agent_executions = 20
    WHERE name = 'Pro';

    UPDATE plans SET 
      max_ai_assistant_calls = 20,
      max_ai_compose_uses = 20,
      max_ai_agent_executions = 20
    WHERE name = 'Beta-Pro';

    UPDATE plans SET 
      max_ai_assistant_calls = 100,
      max_ai_compose_uses = 100,
      max_ai_agent_executions = 100
    WHERE name = 'Business';

    UPDATE plans SET 
      max_ai_assistant_calls = 100,
      max_ai_compose_uses = 100,
      max_ai_agent_executions = 100
    WHERE name = 'Enterprise';

    -- Add indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_monthly_usage_ai_calls ON monthly_usage(user_id, year, month, ai_assistant_calls);
    CREATE INDEX IF NOT EXISTS idx_monthly_usage_ai_compose ON monthly_usage(user_id, year, month, ai_compose_uses);
    CREATE INDEX IF NOT EXISTS idx_monthly_usage_ai_agent ON monthly_usage(user_id, year, month, ai_agent_executions);
  `

  // Migration 2: AI Cost Tracking
  const aiCostTrackingSQL = `
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
  `

  console.log('\n📋 MIGRATION 1: AI Usage Limits')
  console.log('=' * 50)
  console.log(aiUsageLimitsSQL)
  
  console.log('\n📋 MIGRATION 2: AI Cost Tracking')
  console.log('=' * 50)
  console.log(aiCostTrackingSQL)
  
  console.log('\n🎯 Instructions:')
  console.log('1. Go to your Supabase Dashboard')
  console.log('2. Navigate to SQL Editor')
  console.log('3. Copy and paste each migration separately')
  console.log('4. Click "Run" for each one')
  console.log('5. Verify the tables and columns were created successfully')
  
  console.log('\n📊 What will be added:')
  console.log('✅ AI usage tracking columns to monthly_usage table')
  console.log('✅ AI limits to plans table')
  console.log('✅ ai_cost_logs table for detailed cost tracking')
  console.log('✅ monthly_ai_costs table for cost aggregation')
  console.log('✅ RLS policies for security')
  console.log('✅ Automatic triggers for cost updates')
  console.log('✅ Performance indexes')
}

runMigrations().catch(console.error) 