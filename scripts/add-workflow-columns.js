import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { db } from '../db.ts';

async function runWorkflowMigration() {
  try {
    console.log('🔧 Running database migration to add workflow nodes and connections columns...');
    
    // Add nodes column
    console.log('📝 Adding nodes column...');
    const { error: nodesError } = await db.rpc('exec_sql', { 
      sql: 'ALTER TABLE workflows ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT \'[]\'::jsonb;' 
    });
    
    if (nodesError) {
      console.error('❌ Failed to add nodes column:', nodesError);
      return;
    }
    
    console.log('✅ nodes column added successfully');
    
    // Add connections column
    console.log('📝 Adding connections column...');
    const { error: connectionsError } = await db.rpc('exec_sql', { 
      sql: 'ALTER TABLE workflows ADD COLUMN IF NOT EXISTS connections JSONB DEFAULT \'[]\'::jsonb;' 
    });
    
    if (connectionsError) {
      console.error('❌ Failed to add connections column:', connectionsError);
      return;
    }
    
    console.log('✅ connections column added successfully');
    
    // Add status column
    console.log('📝 Adding status column...');
    const { error: statusError } = await db.rpc('exec_sql', { 
      sql: 'ALTER TABLE workflows ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'draft\' CHECK (status IN (\'draft\', \'active\', \'archived\'));' 
    });
    
    if (statusError) {
      console.error('❌ Failed to add status column:', statusError);
      return;
    }
    
    console.log('✅ status column added successfully');
    
    // Create indexes for better performance
    console.log('📝 Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);',
      'CREATE INDEX IF NOT EXISTS idx_workflows_nodes_gin ON workflows USING GIN (nodes);',
      'CREATE INDEX IF NOT EXISTS idx_workflows_connections_gin ON workflows USING GIN (connections);'
    ];
    
    for (const indexSql of indexes) {
      const { error: indexError } = await db.rpc('exec_sql', { sql: indexSql });
      if (indexError) {
        console.error('❌ Failed to create index:', indexError);
        return;
      }
    }
    
    console.log('✅ Indexes created successfully');
    
    // Add comments for documentation
    console.log('📝 Adding column comments...');
    const comments = [
      'COMMENT ON COLUMN workflows.nodes IS \'JSON array of workflow nodes with their positions and configurations\';',
      'COMMENT ON COLUMN workflows.connections IS \'JSON array of connections between workflow nodes\';',
      'COMMENT ON COLUMN workflows.status IS \'Workflow status: draft, active, or archived\';'
    ];
    
    for (const commentSql of comments) {
      const { error: commentError } = await db.rpc('exec_sql', { sql: commentSql });
      if (commentError) {
        console.error('❌ Failed to add comment:', commentError);
        return;
      }
    }
    
    console.log('✅ Column comments added successfully');
    
    console.log('🎉 Workflow migration completed successfully!');
    console.log('📋 Added columns: nodes (JSONB), connections (JSONB), status (TEXT)');
    console.log('📋 Created indexes for better query performance');
    
  } catch (error) {
    console.error('❌ Error running workflow migration:', error);
  }
}

runWorkflowMigration(); 