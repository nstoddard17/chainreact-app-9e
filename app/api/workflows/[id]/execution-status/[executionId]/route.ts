import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

/**
 * Get real-time execution status for live mode visualization
 * This endpoint is polled by the frontend to show live execution progress
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; executionId: string }> }
) {
  try {
    const { id: workflowId, executionId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get execution progress
    const { data: progress, error: progressError } = await supabase
      .from('execution_progress')
      .select('*')
      .eq('execution_id', executionId)
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (progressError) {
      console.error('Error fetching execution progress:', progressError)
      return NextResponse.json(
        { error: 'Failed to fetch execution progress' },
        { status: 500 }
      )
    }

    if (!progress) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    // Get execution details
    const { data: execution } = await supabase
      .from('executions')
      .select('*')
      .eq('id', executionId)
      .single()

    // Get workflow to include node details
    const { data: workflow } = await supabase
      .from('workflows')
      .select('nodes, connections')
      .eq('id', workflowId)
      .single()

    // Calculate additional metrics
    const totalNodes = workflow?.nodes?.length || 0
    const completedNodes = progress.completed_nodes || []
    const failedNodes = progress.failed_nodes || []
    const currentNode = progress.current_node_id
      ? workflow?.nodes?.find((n: any) => n.id === progress.current_node_id)
      : null

    return NextResponse.json({
      execution: {
        id: executionId,
        workflowId,
        status: progress.status,
        startedAt: progress.started_at,
        completedAt: progress.completed_at,
        executionDetails: execution,
      },
      progress: {
        status: progress.status,
        currentNodeId: progress.current_node_id,
        currentNodeName: progress.current_node_name,
        currentNode,
        completedNodes,
        failedNodes,
        totalNodes,
        progressPercentage: progress.progress_percentage,
        errorMessage: progress.error_message,
      },
      workflow: {
        nodes: workflow?.nodes || [],
        connections: workflow?.connections || [],
      },
    })
  } catch (error: any) {
    console.error('Error getting execution status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get execution status' },
      { status: 500 }
    )
  }
}
