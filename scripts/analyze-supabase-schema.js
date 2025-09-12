import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeDatabase() {
  console.log('🔍 Analyzing your Supabase database schema...\n');

  try {
    // 1. Get all tables
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_tables_info', {}, { count: 'exact' })
      .select('*');

    if (tablesError) {
      // If the RPC doesn't exist, use a direct query
      const { data: tableList, error: tableListError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');

      if (tableListError) {
        console.log('Could not fetch tables via RPC, using alternative method...');
        
        // Use raw SQL query
        const { data: rawTables, error: rawError } = await supabase.rpc('query_database', {
          query: `
            SELECT 
              t.tablename,
              t.rowsecurity as has_rls,
              obj_description(c.oid) as description
            FROM pg_tables t
            LEFT JOIN pg_class c ON c.relname = t.tablename 
            AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            WHERE t.schemaname = 'public'
            ORDER BY t.tablename
          `
        });

        if (rawError) {
          // Final fallback - query known tables directly
          console.log('Using fallback method to discover tables...');
          return await analyzeKnownTables();
        }

        return processTableData(rawTables);
      }

      return processTableData(tableList);
    }

    return processTableData(tables);
  } catch (error) {
    console.error('Error analyzing database:', error);
    return await analyzeKnownTables();
  }
}

async function analyzeKnownTables() {
  console.log('📊 Analyzing known tables from codebase references...\n');

  const knownTables = [
    'user_profiles',
    'integrations',
    'workflows',
    'workflow_executions',
    'workflow_variables',
    'subscriptions',
    'invoices',
    'plans',
    'organizations',
    'organization_members',
    'organization_invitations',
    'teams',
    'team_members',
    'audit_logs',
    'activity_logs',
    'support_tickets',
    'support_ticket_responses',
    'templates',
    'presence',
    'pkce_flow',
    'file_storage'
  ];

  const tableInfo = [];

  for (const tableName of knownTables) {
    try {
      // Try to query the table to see if it exists
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(0);

      if (!error) {
        console.log(`✅ Found table: ${tableName}`);
        
        // Get column info by querying with limit 1
        const { data: sample, error: sampleError } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        let columns = [];
        if (!sampleError && sample && sample.length > 0) {
          columns = Object.keys(sample[0]);
        }

        tableInfo.push({
          table_name: tableName,
          exists: true,
          columns: columns,
          has_user_id: columns.includes('user_id'),
          has_created_by: columns.includes('created_by'),
          has_owner_id: columns.includes('owner_id'),
          has_organization_id: columns.includes('organization_id')
        });
      } else {
        console.log(`❌ Table not found: ${tableName}`);
        tableInfo.push({
          table_name: tableName,
          exists: false
        });
      }
    } catch (err) {
      console.log(`❌ Error checking table ${tableName}:`, err.message);
    }
  }

  return tableInfo;
}

function processTableData(tables) {
  console.log('\n📋 Database Analysis Complete!\n');
  console.log('Tables found:', tables?.length || 0);
  return tables;
}

async function generateRLSScript(tableInfo) {
  console.log('\n✍️ Generating custom RLS script...\n');

  let script = `-- =====================================================
-- CUSTOM RLS SETUP FOR YOUR DATABASE
-- Generated: ${new Date().toISOString()}
-- =====================================================

-- Drop existing policies
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

`;

  // Process each table
  for (const table of tableInfo) {
    if (!table.exists) continue;

    script += `-- =====================================================
-- TABLE: ${table.table_name}
-- =====================================================

ALTER TABLE ${table.table_name} ENABLE ROW LEVEL SECURITY;

`;

    // Generate appropriate policies based on columns
    if (table.table_name === 'user_profiles') {
      script += `-- User profiles: Users can only access their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

`;
    } else if (table.table_name === 'plans') {
      script += `-- Plans: Public read access
CREATE POLICY "Public can view plans" ON plans
    FOR SELECT USING (true);

`;
    } else if (table.table_name === 'organizations') {
      const userColumn = table.has_created_by ? 'created_by' : 
                         table.has_owner_id ? 'owner_id' : null;
      
      script += `-- Organizations: Member-based access
CREATE POLICY "Members can view organizations" ON organizations
    FOR SELECT USING (
        id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
    );
`;
      
      if (userColumn) {
        script += `CREATE POLICY "Users can create organizations" ON organizations
    FOR INSERT WITH CHECK (auth.uid() = ${userColumn});
`;
      } else {
        script += `CREATE POLICY "Users can create organizations" ON organizations
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
`;
      }
      
      script += `CREATE POLICY "Admins can update organizations" ON organizations
    FOR UPDATE USING (
        id IN (SELECT organization_id FROM organization_members 
               WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
    );
CREATE POLICY "Owners can delete organizations" ON organizations
    FOR DELETE USING (
        id IN (SELECT organization_id FROM organization_members 
               WHERE user_id = auth.uid() AND role = 'owner')
    );

`;
    } else if (table.has_user_id) {
      // Standard user_id based policies
      script += `-- Standard user-based access
CREATE POLICY "Users can view own ${table.table_name}" ON ${table.table_name}
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own ${table.table_name}" ON ${table.table_name}
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ${table.table_name}" ON ${table.table_name}
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ${table.table_name}" ON ${table.table_name}
    FOR DELETE USING (auth.uid() = user_id);

`;
    } else if (table.has_created_by) {
      // created_by based policies
      script += `-- Creator-based access
CREATE POLICY "Users can view own ${table.table_name}" ON ${table.table_name}
    FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can create own ${table.table_name}" ON ${table.table_name}
    FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own ${table.table_name}" ON ${table.table_name}
    FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own ${table.table_name}" ON ${table.table_name}
    FOR DELETE USING (auth.uid() = created_by);

`;
    }

    // Add service role bypass for all tables
    script += `-- Service role bypass
CREATE POLICY "Service role bypass ${table.table_name}" ON ${table.table_name}
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

`;
  }

  script += `-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled'
    END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;`;

  return script;
}

// Main execution
async function main() {
  try {
    const tableInfo = await analyzeDatabase();
    const rlsScript = await generateRLSScript(tableInfo);
    
    // Save the script
    const outputPath = './scripts/custom-rls-setup.sql';
    fs.writeFileSync(outputPath, rlsScript);
    
    console.log(`\n✅ Custom RLS script generated: ${outputPath}`);
    console.log('\n📝 Summary:');
    console.log(`- Tables analyzed: ${tableInfo.filter(t => t.exists).length}`);
    console.log(`- Tables with user_id: ${tableInfo.filter(t => t.has_user_id).length}`);
    console.log(`- Tables with created_by: ${tableInfo.filter(t => t.has_created_by).length}`);
    console.log(`- Tables with organization_id: ${tableInfo.filter(t => t.has_organization_id).length}`);
    
    console.log('\n🚀 Next steps:');
    console.log('1. Review the generated script: scripts/custom-rls-setup.sql');
    console.log('2. Run it in your Supabase SQL Editor');
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main();