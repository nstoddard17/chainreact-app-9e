import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * GET /api/workflows/[id]/executions/[executionId]
 * Get details for a specific execution
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { id: workflowId, executionId } = await params

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Fetch execution details
    const { data: execution, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', executionId)
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      logger.error('Error fetching execution details:', error)
      return errorResponse('Failed to fetch execution details' , 500)
    }

    if (!execution) {
      return errorResponse('Execution not found' , 404)
    }

    return jsonResponse(execution)
  } catch (error) {
    logger.error('Error in execution details API:', error)
    return errorResponse('Internal server error' , 500)
  }
}