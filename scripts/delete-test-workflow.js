import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteTestWorkflows() {
  try {
    console.log('🗑️ Deleting test workflows...\n');

    // Get all workflows with the copied template name
    const { data: workflows, error: fetchError } = await supabase
      .from('workflows')
      .select('id, name, created_at')
      .ilike('name', '%AI Agent Test Workflow%Copy%');

    if (fetchError) {
      console.error('Error fetching workflows:', fetchError);
      return;
    }

    if (!workflows || workflows.length === 0) {
      console.log('No test workflows found to delete');
      return;
    }

    console.log(`Found ${workflows.length} test workflow(s) to delete:`);
    workflows.forEach(w => {
      console.log(`  - ${w.name} (${w.id})`);
    });

    // Delete the workflows
    const { error: deleteError } = await supabase
      .from('workflows')
      .delete()
      .in('id', workflows.map(w => w.id));

    if (deleteError) {
      console.error('Error deleting workflows:', deleteError);
      return;
    }

    console.log(`\n✅ Successfully deleted ${workflows.length} workflow(s)`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

deleteTestWorkflows();