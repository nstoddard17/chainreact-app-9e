import { NextRequest, NextResponse } from 'next/server'
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      return NextResponse.json(
        { error: 'Failed to fetch executions' },
        { status: 500 }
      )
    }

    return NextResponse.json(executions || [])
  } catch (error) {
    logger.error('Error in workflow executions API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}