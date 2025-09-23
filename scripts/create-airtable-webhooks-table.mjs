#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function createTable() {
  console.log('🔨 Creating airtable_webhooks table...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Use SQL to create the table
    const { error } = await supabase.rpc('exec_sql', {
      sql_query: `
        -- Create airtable_webhooks table
        CREATE TABLE IF NOT EXISTS public.airtable_webhooks (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          base_id TEXT NOT NULL,
          webhook_id TEXT NOT NULL,
          mac_secret_base64 TEXT,
          expiration_time TIMESTAMPTZ,
          status TEXT DEFAULT 'active',
          last_cursor INTEGER,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, base_id, webhook_id)
        );
      `
    })

    if (error) {
      // Try a simpler approach
      console.log('Trying direct approach...')

      // Just check if we can insert - if table doesn't exist, it will error
      const testInsert = await supabase
        .from('airtable_webhooks')
        .select('id')
        .limit(1)

      if (testInsert.error?.message?.includes('does not exist')) {
        console.error('❌ Table does not exist and cannot be created via API')
        console.log('\n💡 You need to create this table manually in Supabase:')
        console.log('1. Go to https://supabase.com/dashboard')
        console.log('2. Open your project')
        console.log('3. Go to SQL Editor')
        console.log('4. Run the SQL from: /supabase/migrations/20250123_create_airtable_webhooks.sql')
      } else {
        console.log('✅ Table already exists!')
      }
    } else {
      console.log('✅ Table created successfully!')
    }

  } catch (err) {
    console.error('Error:', err.message)
  }
}

createTable().then(() => {
  console.log('\nDone!')
  process.exit(0)
})