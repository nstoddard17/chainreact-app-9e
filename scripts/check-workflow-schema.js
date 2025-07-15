import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { db } from '../db.ts';

async function checkWorkflowSchema() {
  try {
    console.log('🔍 Checking workflow table schema...');
    
    // Query the information_schema to see what columns exist
    const { data, error } = await db.rpc('exec_sql', { 
      sql: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'workflows' 
        ORDER BY ordinal_position;
      ` 
    });
    
    if (error) {
      console.error('❌ Failed to check schema:', error);
      return;
    }
    
    console.log('📋 Current workflow table columns:');
    console.table(data);
    
    // Check specifically for nodes and connections columns
    const hasNodes = data.some(col => col.column_name === 'nodes');
    const hasConnections = data.some(col => col.column_name === 'connections');
    const hasStatus = data.some(col => col.column_name === 'status');
    
    console.log('\n🔍 Column Check Results:');
    console.log('✅ nodes column exists:', hasNodes);
    console.log('✅ connections column exists:', hasConnections);
    console.log('✅ status column exists:', hasStatus);
    
    if (!hasNodes || !hasConnections) {
      console.log('\n❌ Missing required columns! You need to run the migration.');
      console.log('Run: node scripts/add-workflow-columns.js');
    } else {
      console.log('\n✅ All required columns exist!');
    }
    
  } catch (error) {
    console.error('❌ Error checking schema:', error);
  }
}

checkWorkflowSchema(); 