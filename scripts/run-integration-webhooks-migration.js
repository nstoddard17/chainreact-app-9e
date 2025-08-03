import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

console.log('🚀 Starting Integration Webhooks migration...')
console.log('📋 Since exec_sql function is not available, here are the SQL statements to run manually:')

const integrationWebhooksSQL = `-- Create integration webhooks table for integration-specific webhook configurations

CREATE TABLE IF NOT EXISTS integration_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  trigger_types TEXT[] NOT NULL DEFAULT '{}',
  integration_config JSONB DEFAULT '{}',
  external_config JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_triggered TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`

console.log('\n📋 INTEGRATION WEBHOOKS MIGRATION')
console.log('=' * 50)
console.log(integrationWebhooksSQL)

console.log('\n🎯 Instructions:')
console.log('1. Go to your Supabase Dashboard')
console.log('2. Navigate to SQL Editor')
console.log('3. Copy and paste the migration above')
console.log('4. Click "Run"')
console.log('5. Verify the integration_webhooks table was created successfully')

console.log('\n📊 What will be added:')
console.log('✅ integration_webhooks table for integration-specific webhooks')
console.log('✅ Basic table structure only')
console.log('✅ No policies, functions, or triggers (minimal)')

console.log('\n🔗 After running this migration, the Integration Webhooks tab should work properly!')
console.log('Note: Sample webhook configurations will be added dynamically when users access the page.') 