import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * GET /api/workflows/[id]/executions
 * Get all executions for a specific workflow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { id: workflowId } = await params

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Fetch executions for this workflow
    const { data: executions, error } = await supabase
      .from('workflow_executions')
      .select('id, status, started_at, completed_at, execution_time_ms, error_message')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(20) // Limit to last 20 executions

    if (error) {
      logger.error('Error fetching workflow executions:', error)
      return errorResponse('Failed to fetch executions' , 500)
    }

    return jsonResponse(executions || [])
  } catch (error) {
    logger.error('Error in workflow executions API:', error)
    return errorResponse('Internal server error' , 500)
  }
}