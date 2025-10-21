import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { executionHistoryService } from '@/lib/services/executionHistoryService'

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { executionId } = await params

    // Verify user owns the execution
    const { data: execution, error: executionError } = await supabase
      .from('workflow_execution_history')
      .select('id, user_id, workflow_id, status, test_mode, started_at, completed_at')
      .eq('id', executionId)
      .single()

    if (executionError || !execution) {
      return errorResponse('Execution not found' , 404)
    }

    if (execution.user_id !== user.id) {
      return errorResponse('Unauthorized' , 403)
    }

    // Get execution steps
    const steps = await executionHistoryService.getExecutionSteps(executionId)

    return jsonResponse({
      execution,
      steps
    })
  } catch (error) {
    logger.error('Error fetching execution steps:', error)
    return errorResponse('Failed to fetch execution steps' , 500)
  }
}