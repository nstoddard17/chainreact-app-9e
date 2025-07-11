import { db } from '../db.ts';

async function runMigration() {
  try {
    console.log('🔧 Running database migration to add team_id column...');
    
    // Add the team_id column
    console.log('📝 Adding team_id column...');
    const { error: alterError } = await db.rpc('exec_sql', { 
      sql: 'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS team_id TEXT;' 
    });
    
    if (alterError) {
      console.error('❌ Failed to add team_id column:', alterError);
      return;
    }
    
    console.log('✅ team_id column added successfully');
    
    // Add index for better performance
    console.log('📝 Adding index...');
    const { error: indexError } = await db.rpc('exec_sql', { 
      sql: 'CREATE INDEX IF NOT EXISTS idx_integrations_team_id ON integrations(team_id);' 
    });
    
    if (indexError) {
      console.error('❌ Failed to add index:', indexError);
      return;
    }
    
    console.log('✅ Index added successfully');
    
    // Update existing Slack integrations to populate team_id from metadata
    console.log('📝 Updating existing Slack integrations...');
    const { error: updateError } = await db.rpc('exec_sql', { 
      sql: `
        UPDATE integrations 
        SET team_id = (metadata->>'team_id')::TEXT
        WHERE provider = 'slack' 
          AND metadata IS NOT NULL 
          AND metadata->>'team_id' IS NOT NULL
          AND team_id IS NULL;
      ` 
    });
    
    if (updateError) {
      console.error('❌ Failed to update existing integrations:', updateError);
      return;
    }
    
    console.log('✅ Existing Slack integrations updated successfully');
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running migration:', error);
  }
}

runMigration(); 