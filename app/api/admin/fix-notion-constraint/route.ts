import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"
import { requireCronAuth } from '@/lib/utils/cron-auth'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const cronAuth = requireCronAuth(request)
    if (!cronAuth.authorized) return cronAuth.response

    const supabase = createAdminClient()
    
    logger.info('🔧 Running migration to allow multiple Notion workspaces...')
    
    // Step 1: Drop the existing unique constraint
    logger.info('📝 Dropping existing unique constraint...')
    const { error: dropError } = await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_user_id_provider_key;' 
    })
    
    if (dropError) {
      logger.error('❌ Failed to drop constraint:', dropError)
      return errorResponse(dropError.message , 500)
    }
    
    logger.info('✅ Existing constraint dropped successfully')
    
    // Step 2: Create new unique constraint that excludes Notion
    logger.info('📝 Creating new unique constraint (excluding Notion)...')
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
      return errorResponse(createError.message , 500)
    }
    
    logger.info('✅ New constraint created successfully')
    
    // Step 3: Create workspace-specific constraint for Notion
    logger.info('📝 Creating Notion workspace constraint...')
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
      return errorResponse(notionError.message , 500)
    }
    
    logger.info('✅ Notion workspace constraint created successfully')
    
    // Step 4: Add index for better performance
    logger.info('📝 Adding performance index...')
    const { error: indexError } = await supabase.rpc('exec_sql', { 
      sql: `
        CREATE INDEX IF NOT EXISTS idx_integrations_notion_workspace 
        ON integrations(user_id, provider, (metadata->>'workspace_id')) 
        WHERE provider = 'notion';
      ` 
    })
    
    if (indexError) {
      logger.error('❌ Failed to add index:', indexError)
      return errorResponse(indexError.message , 500)
    }
    
    logger.info('✅ Performance index added successfully')
    
    // Step 5: Verify the changes
    logger.info('📝 Verifying constraints...')
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
      return errorResponse(verifyError.message , 500)
    }
    
    logger.info('✅ Constraints verified:', constraints)
    
    logger.info('🎉 Migration completed successfully!')
    
    return jsonResponse({
      success: true,
      message: 'Migration completed successfully!',
      constraints: constraints
    })
    
  } catch (error: any) {
    logger.error('❌ Error running migration:', error)
    return errorResponse(error.message , 500)
  }
} 