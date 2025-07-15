// Script to run the add_workflow_nodes_connections.sql migration
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing required environment variables.');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

// Initialize Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Running migration: add_workflow_nodes_connections.sql');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'add_workflow_nodes_connections.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration using Supabase's rpc function
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSql });
    
    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
    
    console.log('Migration completed successfully!');
    console.log('Data:', data);
    
    // Verify migration by checking the schema
    const { data: tableInfo, error: tableError } = await supabase
      .from('workflows')
      .select('nodes, connections')
      .limit(1);
    
    if (tableError) {
      console.error('Error verifying migration:', tableError);
    } else {
      console.log('Schema verification successful. Sample data:', tableInfo);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

runMigration(); 