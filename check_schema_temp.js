const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  // Try to select with both column names to see which one exists
  const test1 = await supabase.from('workflows_revisions').select('workflow_id').limit(1);
  const test2 = await supabase.from('workflows_revisions').select('flow_id').limit(1);
  
  console.log('workflow_id column:', test1.error ? 'ERROR - ' + test1.error.message : 'EXISTS ✓');
  console.log('flow_id column:', test2.error ? 'ERROR - ' + test2.error.message : 'EXISTS ✓');
  
  if (!test1.error) {
    console.log('\nConfirmed: The correct column name is "workflow_id"');
    console.log('The fix to change flow_id -> workflow_id is CORRECT');
  }
}

checkSchema();
