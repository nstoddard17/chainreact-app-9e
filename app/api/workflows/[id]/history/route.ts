import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { executionHistoryService } from '@/lib/services/executionHistoryService'

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: workflowId } = await params

    // Verify user owns the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    if (workflow.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get execution history
    const history = await executionHistoryService.getWorkflowHistory(workflowId, 100)

    return NextResponse.json({ history })
  } catch (error) {
    logger.error('Error fetching workflow history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch workflow history' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: workflowId } = await params

    // Verify user owns the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    if (workflow.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete execution history
    await executionHistoryService.deleteWorkflowHistory(workflowId)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Error deleting workflow history:', error)
    return NextResponse.json(
      { error: 'Failed to delete workflow history' },
      { status: 500 }
    )
  }
}