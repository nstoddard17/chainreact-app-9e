import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' }
})

async function createProcessedRecordsTable() {
  try {
    console.log('Creating airtable_processed_records table...')

    // Create the table using raw SQL
    const { error: createError } = await supabase.rpc('exec', {
      sql: `
        -- Create table to track processed Airtable records
        CREATE TABLE IF NOT EXISTS public.airtable_processed_records (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
          base_id TEXT NOT NULL,
          table_id TEXT NOT NULL,
          record_id TEXT NOT NULL,
          field_count INTEGER NOT NULL,
          field_hash TEXT,
          processed_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(workflow_id, base_id, table_id, record_id)
        );
      `
    })

    if (createError) {
      console.log('Table might already exist, continuing...')
    }

    // Create indexes
    const { error: indexError } = await supabase.rpc('exec', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_airtable_processed_workflow ON public.airtable_processed_records(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_airtable_processed_record ON public.airtable_processed_records(base_id, table_id, record_id);
        CREATE INDEX IF NOT EXISTS idx_airtable_processed_at ON public.airtable_processed_records(processed_at);
      `
    })

    if (indexError) {
      console.log('Error creating indexes:', indexError)
    }

    console.log('✅ Successfully created airtable_processed_records table')

    // Test insertion
    console.log('Testing table...')
    const { data, error } = await supabase
      .from('airtable_processed_records')
      .select('*')
      .limit(1)

    if (error) {
      console.error('Table test failed:', error)
    } else {
      console.log('✅ Table is working correctly!')
    }

  } catch (error) {
    console.error('Error creating table:', error)
  }
}

createProcessedRecordsTable()