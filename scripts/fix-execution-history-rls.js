const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixExecutionHistoryRLS() {
  try {
    console.log('Fixing workflow_execution_history RLS policies...')

    // Drop existing service role policy
    const dropResult = await supabase.rpc('exec_sql', {
      sql: `DROP POLICY IF EXISTS "Service role full access" ON public.workflow_execution_history;`
    })

    if (dropResult.error) {
      console.log('Note: Drop policy might not exist, continuing...')
    }

    // Create new permissive service role policy
    const createResult = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Service role bypass all"
          ON public.workflow_execution_history
          FOR ALL
          USING (true)
          WITH CHECK (true);
      `
    })

    if (createResult.error) {
      console.error('Error creating policy:', createResult.error)
      return
    }

    console.log('✅ Successfully fixed RLS policies for workflow_execution_history')

    // Test the fix by trying to insert a test record
    console.log('Testing insertion...')
    const testInsert = await supabase
      .from('workflow_execution_history')
      .insert({
        workflow_id: '00000000-0000-0000-0000-000000000000',
        user_id: 'a3e3a51a-175c-4b59-ad03-227ba12a18b0',
        execution_id: 'test-' + Date.now(),
        status: 'completed',
        test_mode: true,
        input_data: { test: true }
      })

    if (testInsert.error) {
      console.error('Test insertion failed:', testInsert.error)
    } else {
      console.log('✅ Test insertion successful!')

      // Clean up test record
      await supabase
        .from('workflow_execution_history')
        .delete()
        .eq('execution_id', 'test-' + Date.now())
    }

  } catch (error) {
    console.error('Error fixing RLS:', error)
  }
}

fixExecutionHistoryRLS()