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

async function runAllWebhookMigrations() {
  console.log('🚀 Starting all webhook migrations...')
  console.log('📋 This will create tables for both custom webhooks and integration webhooks:')
  
  const customWebhookSQL = `
    -- Create custom webhook tables for user-created webhooks

    -- Table for custom webhook configurations
    CREATE TABLE IF NOT EXISTS custom_webhooks (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      webhook_url TEXT NOT NULL,
      method VARCHAR(10) NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH')),
      headers JSONB DEFAULT '{}',
      body_template TEXT,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
      last_triggered TIMESTAMP WITH TIME ZONE,
      trigger_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Table for custom webhook execution logs
    CREATE TABLE IF NOT EXISTS custom_webhook_executions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      webhook_id UUID REFERENCES custom_webhooks(id) ON DELETE CASCADE,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'pending')),
      response_code INTEGER,
      response_body TEXT,
      error_message TEXT,
      execution_time_ms INTEGER NOT NULL,
      triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      payload_sent JSONB
    );

    -- Indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_custom_webhooks_user_id ON custom_webhooks(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_webhooks_status ON custom_webhooks(status);
    CREATE INDEX IF NOT EXISTS idx_custom_webhooks_created_at ON custom_webhooks(created_at);

    CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_webhook_id ON custom_webhook_executions(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_user_id ON custom_webhook_executions(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_status ON custom_webhook_executions(status);
    CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_triggered_at ON custom_webhook_executions(triggered_at);

    -- RLS Policies for custom_webhooks
    ALTER TABLE custom_webhooks ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view their own custom webhooks" ON custom_webhooks
      FOR SELECT USING (auth.uid() = user_id);

    CREATE POLICY "Users can insert their own custom webhooks" ON custom_webhooks
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can update their own custom webhooks" ON custom_webhooks
      FOR UPDATE USING (auth.uid() = user_id);

    CREATE POLICY "Users can delete their own custom webhooks" ON custom_webhooks
      FOR DELETE USING (auth.uid() = user_id);

    -- RLS Policies for custom_webhook_executions
    ALTER TABLE custom_webhook_executions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view their own custom webhook executions" ON custom_webhook_executions
      FOR SELECT USING (auth.uid() = user_id);

    CREATE POLICY "Users can insert their own custom webhook executions" ON custom_webhook_executions
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    -- Function to update custom webhook updated_at timestamp
    CREATE OR REPLACE FUNCTION update_custom_webhook_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger to automatically update custom webhook updated_at
    CREATE TRIGGER trigger_update_custom_webhook_updated_at
      BEFORE UPDATE ON custom_webhooks
      FOR EACH ROW
      EXECUTE FUNCTION update_custom_webhook_updated_at();
  `

  const integrationWebhookSQL = `
    -- Create integration webhook tables for automatic webhook setup

    -- Table for integration webhook configurations
    CREATE TABLE IF NOT EXISTS integration_webhooks (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      provider_id VARCHAR(100) NOT NULL,
      webhook_url TEXT NOT NULL,
      trigger_types TEXT[] NOT NULL,
      integration_config JSONB DEFAULT '{}',
      external_config JSONB,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
      last_triggered TIMESTAMP WITH TIME ZONE,
      trigger_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Table for integration webhook execution logs
    CREATE TABLE IF NOT EXISTS integration_webhook_executions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      webhook_id UUID REFERENCES integration_webhooks(id) ON DELETE CASCADE,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      provider_id VARCHAR(100) NOT NULL,
      trigger_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      headers JSONB,
      status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'pending')),
      response_code INTEGER,
      response_body TEXT,
      error_message TEXT,
      execution_time_ms INTEGER,
      triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_integration_webhooks_user_id ON integration_webhooks(user_id);
    CREATE INDEX IF NOT EXISTS idx_integration_webhooks_provider_id ON integration_webhooks(provider_id);
    CREATE INDEX IF NOT EXISTS idx_integration_webhooks_status ON integration_webhooks(status);
    CREATE INDEX IF NOT EXISTS idx_integration_webhooks_created_at ON integration_webhooks(created_at);

    CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_webhook_id ON integration_webhook_executions(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_user_id ON integration_webhook_executions(user_id);
    CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_provider_id ON integration_webhook_executions(provider_id);
    CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_trigger_type ON integration_webhook_executions(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_status ON integration_webhook_executions(status);
    CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_triggered_at ON integration_webhook_executions(triggered_at);

    -- RLS Policies for integration_webhooks
    ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view their own integration webhooks" ON integration_webhooks
      FOR SELECT USING (auth.uid() = user_id);

    CREATE POLICY "Users can insert their own integration webhooks" ON integration_webhooks
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can update their own integration webhooks" ON integration_webhooks
      FOR UPDATE USING (auth.uid() = user_id);

    CREATE POLICY "Users can delete their own integration webhooks" ON integration_webhooks
      FOR DELETE USING (auth.uid() = user_id);

    -- RLS Policies for integration_webhook_executions
    ALTER TABLE integration_webhook_executions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view their own integration webhook executions" ON integration_webhook_executions
      FOR SELECT USING (auth.uid() = user_id);

    CREATE POLICY "Users can insert their own integration webhook executions" ON integration_webhook_executions
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    -- Function to update integration webhook updated_at timestamp
    CREATE OR REPLACE FUNCTION update_integration_webhook_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger to automatically update integration webhook updated_at
    CREATE TRIGGER trigger_update_integration_webhook_updated_at
      BEFORE UPDATE ON integration_webhooks
      FOR EACH ROW
      EXECUTE FUNCTION update_integration_webhook_updated_at();
  `

  console.log('\n📋 MIGRATION 1: Custom Webhooks')
  console.log('=' * 50)
  console.log(customWebhookSQL)

  console.log('\n📋 MIGRATION 2: Integration Webhooks')
  console.log('=' * 50)
  console.log(integrationWebhookSQL)
  
  console.log('\n🎯 Instructions:')
  console.log('1. Go to your Supabase Dashboard')
  console.log('2. Navigate to SQL Editor')
  console.log('3. Copy and paste each migration separately')
  console.log('4. Click "Run" for each one')
  console.log('5. Verify the tables were created successfully')
  
  console.log('\n📊 What will be added:')
  console.log('✅ Custom webhooks table for user-created webhooks')
  console.log('✅ Custom webhook executions table for logging')
  console.log('✅ Integration webhooks table for automatic webhook setup')
  console.log('✅ Integration webhook executions table for logging')
  console.log('✅ RLS policies for security')
  console.log('✅ Automatic triggers for timestamps')
  console.log('✅ Performance indexes')
  
  console.log('\n🔧 Features:')
  console.log('✅ Users can create their own custom webhooks')
  console.log('✅ Automatic webhook setup for all integrations')
  console.log('✅ Webhook execution logging and monitoring')
  console.log('✅ Error tracking and status management')
}

runAllWebhookMigrations().catch(console.error) 