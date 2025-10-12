import { NextRequest, NextResponse } from 'next/server'
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      return NextResponse.json(
        { error: 'Failed to fetch execution details' },
        { status: 500 }
      )
    }

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(execution)
  } catch (error) {
    logger.error('Error in execution details API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}