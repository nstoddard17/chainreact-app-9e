import { db } from '../db.ts';

async function fixNotionMultipleWorkspaces() {
  try {
    console.log('🔧 Running migration to allow multiple Notion workspaces...');
    
    // Step 1: Drop the existing unique constraint
    console.log('📝 Dropping existing unique constraint...');
    const { error: dropError } = await db.rpc('exec_sql', { 
      sql: 'ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_user_id_provider_key;' 
    });
    
    if (dropError) {
      console.error('❌ Failed to drop constraint:', dropError);
      return;
    }
    
    console.log('✅ Existing constraint dropped successfully');
    
    // Step 2: Create new unique constraint that excludes Notion
    console.log('📝 Creating new unique constraint (excluding Notion)...');
    const { error: createError } = await db.rpc('exec_sql', { 
      sql: `
        ALTER TABLE integrations 
        ADD CONSTRAINT integrations_user_id_provider_key 
        UNIQUE (user_id, provider) 
        WHERE provider != 'notion';
      ` 
    });
    
    if (createError) {
      console.error('❌ Failed to create new constraint:', createError);
      return;
    }
    
    console.log('✅ New constraint created successfully');
    
    // Step 3: Create workspace-specific constraint for Notion
    console.log('📝 Creating Notion workspace constraint...');
    const { error: notionError } = await db.rpc('exec_sql', { 
      sql: `
        ALTER TABLE integrations 
        ADD CONSTRAINT integrations_notion_workspace_unique 
        UNIQUE (user_id, provider, (metadata->>'workspace_id')) 
        WHERE provider = 'notion';
      ` 
    });
    
    if (notionError) {
      console.error('❌ Failed to create Notion constraint:', notionError);
      return;
    }
    
    console.log('✅ Notion workspace constraint created successfully');
    
    // Step 4: Add index for better performance
    console.log('📝 Adding performance index...');
    const { error: indexError } = await db.rpc('exec_sql', { 
      sql: `
        CREATE INDEX IF NOT EXISTS idx_integrations_notion_workspace 
        ON integrations(user_id, provider, (metadata->>'workspace_id')) 
        WHERE provider = 'notion';
      ` 
    });
    
    if (indexError) {
      console.error('❌ Failed to add index:', indexError);
      return;
    }
    
    console.log('✅ Performance index added successfully');
    
    // Step 5: Verify the changes
    console.log('📝 Verifying constraints...');
    const { data: constraints, error: verifyError } = await db.rpc('exec_sql', { 
      sql: `
        SELECT 
          conname, 
          contype, 
          pg_get_constraintdef(oid) as constraint_definition
        FROM pg_constraint 
        WHERE conrelid = 'integrations'::regclass 
        AND conname IN ('integrations_user_id_provider_key', 'integrations_notion_workspace_unique');
      ` 
    });
    
    if (verifyError) {
      console.error('❌ Failed to verify constraints:', verifyError);
      return;
    }
    
    console.log('✅ Constraints verified:');
    console.log(constraints);
    
    console.log('🎉 Migration completed successfully!');
    console.log('📋 You can now connect multiple Notion workspaces per user.');
    
  } catch (error) {
    console.error('❌ Error running migration:', error);
  }
}

fixNotionMultipleWorkspaces(); 