import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()

    // Create execution_progress table if it doesn't exist
    const { error: createError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS execution_progress (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          execution_id TEXT NOT NULL,
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

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_execution_progress_execution ON execution_progress(execution_id);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_workflow ON execution_progress(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_status ON execution_progress(execution_id, status);

        -- Enable RLS
        ALTER TABLE execution_progress ENABLE ROW LEVEL SECURITY;
      `
    }).catch(err => {
      logger.debug('Table creation error (may already exist):', err)
      return { error: err }
    })

    // Try to check if table exists by querying it
    const { error: checkError } = await supabase
      .from('execution_progress')
      .select('id')
      .limit(1)

    if (checkError) {
      logger.error('Table check error:', checkError)
      return errorResponse('Table might not exist or permission issue', 500, { details: checkError.message })
    }

    return jsonResponse({
      success: true,
      message: 'execution_progress table is ready'
    })

  } catch (error: any) {
    logger.error('Error ensuring tables:', error)
    return errorResponse(error.message || 'Failed to ensure tables'
    , 500)
  }
}