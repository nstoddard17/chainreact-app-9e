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

console.log('Environment variables:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Found' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Found' : '❌ Missing');

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
    
    // Split the SQL into individual statements
    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement separately
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}:`);
      console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
      
      const { error } = await supabase.rpc('pg_query', { query: statement });
      
      if (error) {
        console.error(`Error executing statement ${i + 1}:`, error);
        // Continue with other statements even if one fails
      } else {
        console.log(`Statement ${i + 1} executed successfully`);
      }
    }
    
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