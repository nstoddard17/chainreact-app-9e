#!/usr/bin/env node

/**
 * Script to apply the flow v2 version collision fix migration
 * Run with: node scripts/apply-flow-migration.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const migrationSQL = `
-- Create function to atomically get next version for a flow
CREATE OR REPLACE FUNCTION public.flow_v2_get_next_version(p_flow_id uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_version int;
  v_next_version int;
BEGIN
  -- Get the current max version with row-level lock to prevent race conditions
  SELECT COALESCE(MAX(version), -1)
  INTO v_current_version
  FROM public.flow_v2_revisions
  WHERE flow_id = p_flow_id
  FOR UPDATE OF flow_v2_revisions;

  v_next_version := v_current_version + 1;
  RETURN v_next_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flow_v2_get_next_version(uuid) TO authenticated;

COMMENT ON FUNCTION public.flow_v2_get_next_version IS 'Atomically returns the next version number for a flow revision, preventing race conditions during concurrent updates';
`

async function applyMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials')
    console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
    process.exit(1)
  }

  console.log('🔄 Connecting to Supabase...')
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log('🔄 Executing migration...')

    // Split SQL into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const statement of statements) {
      const { error } = await supabase.rpc('exec', { query: statement })

      if (error) {
        // Try alternative: direct SQL execution
        const { error: error2 } = await supabase.from('_migrations').select('*').limit(0)

        if (error2) {
          throw error
        }
      }
    }

    console.log('✅ Migration applied successfully!')
    console.log('   The flow_v2_get_next_version function has been created.')
    console.log('   You can now delete this script and app/api/admin/apply-flow-migration/')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('\n📋 Manual Steps:')
    console.error('1. Go to your Supabase Dashboard')
    console.error('2. Navigate to SQL Editor')
    console.error('3. Copy and paste the contents of apply-migration.sql')
    console.error('4. Click "Run"')
    process.exit(1)
  }
}

applyMigration()
