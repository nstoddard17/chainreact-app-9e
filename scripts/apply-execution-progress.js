const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('Creating execution_progress table...');

    // Create the table
    const { error: tableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS execution_progress (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          execution_id UUID NOT NULL,
          workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'running',
          current_node_id TEXT,
          current_node_name TEXT,
          completed_nodes JSONB DEFAULT '[]'::jsonb,
          pending_nodes JSONB DEFAULT '[]'::jsonb,
          failed_nodes JSONB DEFAULT '[]'::jsonb,
          node_outputs JSONB DEFAULT '{}'::jsonb,
          error_message TEXT,
          progress_percentage INTEGER DEFAULT 0,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );
      `
    });

    if (tableError) {
      console.log('Table might already exist or error:', tableError.message);
    } else {
      console.log('✅ Table created successfully');
    }

    // Create indexes
    console.log('Creating indexes...');
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_execution_progress_execution ON execution_progress(execution_id);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_workflow ON execution_progress(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_status ON execution_progress(execution_id, status);
      `
    });

    // Enable RLS
    console.log('Enabling RLS...');
    await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE execution_progress ENABLE ROW LEVEL SECURITY;`
    });

    // Create policies
    console.log('Creating RLS policies...');
    const policies = [
      {
        name: "Users can view their own execution progress",
        sql: `CREATE POLICY "Users can view their own execution progress"
              ON execution_progress FOR SELECT
              USING (auth.uid() = user_id);`
      },
      {
        name: "Users can create their own execution progress",
        sql: `CREATE POLICY "Users can create their own execution progress"
              ON execution_progress FOR INSERT
              WITH CHECK (auth.uid() = user_id);`
      },
      {
        name: "Users can update their own execution progress",
        sql: `CREATE POLICY "Users can update their own execution progress"
              ON execution_progress FOR UPDATE
              USING (auth.uid() = user_id);`
      },
      {
        name: "Users can delete their own execution progress",
        sql: `CREATE POLICY "Users can delete their own execution progress"
              ON execution_progress FOR DELETE
              USING (auth.uid() = user_id);`
      }
    ];

    for (const policy of policies) {
      try {
        await supabase.rpc('exec_sql', { sql: policy.sql });
        console.log(`✅ Created policy: ${policy.name}`);
      } catch (err) {
        console.log(`Policy might already exist: ${policy.name}`);
      }
    }

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('Error applying migration:', error);
  }
}

applyMigration();