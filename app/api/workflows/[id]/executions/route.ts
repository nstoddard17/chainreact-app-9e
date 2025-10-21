import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * GET /api/workflows/[id]/executions
 * Get all executions for a specific workflow with optional filters
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
      return errorResponse('Unauthorized', 401)
    }

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const statusFilter = searchParams.get('status')
    const daysFilter = searchParams.get('days')

    // Build base query
    let query = supabase
      .from('workflow_executions')
      .select(`
        id,
        workflow_id,
        status,
        trigger_type,
        trigger_data,
        started_at,
        completed_at,
        execution_time_ms,
        error_message,
        tasks_used
      `)
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    // Apply date filter
    if (daysFilter && daysFilter !== 'all') {
      const daysAgo = new Date()
      daysAgo.setDate(daysAgo.getDate() - parseInt(daysFilter))
      query = query.gte('started_at', daysAgo.toISOString())
    }

    // Limit results
    query = query.limit(100)

    const { data: executions, error } = await query

    if (error) {
      logger.error('Error fetching workflow executions:', error)
      return errorResponse('Failed to fetch executions', 500)
    }

    // Fetch steps for each execution
    const executionsWithSteps = await Promise.all(
      (executions || []).map(async (execution) => {
        const { data: steps } = await supabase
          .from('execution_steps')
          .select('*')
          .eq('execution_id', execution.id)
          .order('step_number', { ascending: true })

        return {
          ...execution,
          duration_ms: execution.execution_time_ms,
          steps: steps || []
        }
      })
    )

    return jsonResponse({
      success: true,
      executions: executionsWithSteps
    })
  } catch (error) {
    logger.error('Error in workflow executions API:', error)
    return errorResponse('Internal server error', 500)
  }
}