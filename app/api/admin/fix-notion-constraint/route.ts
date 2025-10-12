import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    // Check for admin secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get('secret')
    
    if (secret !== process.env.ADMIN_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()
    
    logger.debug('🔧 Running migration to allow multiple Notion workspaces...')
    
    // Step 1: Drop the existing unique constraint
    logger.debug('📝 Dropping existing unique constraint...')
    const { error: dropError } = await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_user_id_provider_key;' 
    })
    
    if (dropError) {
      logger.error('❌ Failed to drop constraint:', dropError)
      return NextResponse.json({ error: dropError.message }, { status: 500 })
    }
    
    logger.debug('✅ Existing constraint dropped successfully')
    
    // Step 2: Create new unique constraint that excludes Notion
    logger.debug('📝 Creating new unique constraint (excluding Notion)...')
    const { error: createError } = await supabase.rpc('exec_sql', { 
      sql: `
        ALTER TABLE integrations 
        ADD CONSTRAINT integrations_user_id_provider_key 
        UNIQUE (user_id, provider) 
        WHERE provider != 'notion';
      ` 
    })
    
    if (createError) {
      logger.error('❌ Failed to create new constraint:', createError)
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    
    logger.debug('✅ New constraint created successfully')
    
    // Step 3: Create workspace-specific constraint for Notion
    logger.debug('📝 Creating Notion workspace constraint...')
    const { error: notionError } = await supabase.rpc('exec_sql', { 
      sql: `
        ALTER TABLE integrations 
        ADD CONSTRAINT integrations_notion_workspace_unique 
        UNIQUE (user_id, provider, (metadata->>'workspace_id')) 
        WHERE provider = 'notion';
      ` 
    })
    
    if (notionError) {
      logger.error('❌ Failed to create Notion constraint:', notionError)
      return NextResponse.json({ error: notionError.message }, { status: 500 })
    }
    
    logger.debug('✅ Notion workspace constraint created successfully')
    
    // Step 4: Add index for better performance
    logger.debug('📝 Adding performance index...')
    const { error: indexError } = await supabase.rpc('exec_sql', { 
      sql: `
        CREATE INDEX IF NOT EXISTS idx_integrations_notion_workspace 
        ON integrations(user_id, provider, (metadata->>'workspace_id')) 
        WHERE provider = 'notion';
      ` 
    })
    
    if (indexError) {
      logger.error('❌ Failed to add index:', indexError)
      return NextResponse.json({ error: indexError.message }, { status: 500 })
    }
    
    logger.debug('✅ Performance index added successfully')
    
    // Step 5: Verify the changes
    logger.debug('📝 Verifying constraints...')
    const { data: constraints, error: verifyError } = await supabase.rpc('exec_sql', { 
      sql: `
        SELECT 
          conname, 
          contype, 
          pg_get_constraintdef(oid) as constraint_definition
        FROM pg_constraint 
        WHERE conrelid = 'integrations'::regclass 
        AND conname IN ('integrations_user_id_provider_key', 'integrations_notion_workspace_unique');
      ` 
    })
    
    if (verifyError) {
      logger.error('❌ Failed to verify constraints:', verifyError)
      return NextResponse.json({ error: verifyError.message }, { status: 500 })
    }
    
    logger.debug('✅ Constraints verified:', constraints)
    
    logger.debug('🎉 Migration completed successfully!')
    
    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully!',
      constraints: constraints
    })
    
  } catch (error: any) {
    logger.error('❌ Error running migration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 