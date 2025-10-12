import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { executionHistoryService } from '@/lib/services/executionHistoryService'

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { executionId } = await params

    // Verify user owns the execution
    const { data: execution, error: executionError } = await supabase
      .from('workflow_execution_history')
      .select('id, user_id, workflow_id, status, test_mode, started_at, completed_at')
      .eq('id', executionId)
      .single()

    if (executionError || !execution) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
    }

    if (execution.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get execution steps
    const steps = await executionHistoryService.getExecutionSteps(executionId)

    return NextResponse.json({
      execution,
      steps
    })
  } catch (error) {
    logger.error('Error fetching execution steps:', error)
    return NextResponse.json(
      { error: 'Failed to fetch execution steps' },
      { status: 500 }
    )
  }
}