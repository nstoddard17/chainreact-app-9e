import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { backendLogger } from '@/lib/logging/backendLogger'

import { logger } from '@/lib/utils/logger'

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

    // Get last log timestamp from query params (for incremental log fetching)
    const url = new URL(request.url)
    const lastLogTimestamp = url.searchParams.get('lastLogTimestamp')

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
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
      logger.error('Error fetching execution progress:', progressError)

      // If table doesn't exist, return a default progress response with error info
      if (progressError.message?.includes('relation') && progressError.message?.includes('does not exist')) {
        logger.debug('execution_progress table does not exist yet, returning default progress')

        // Return a simulated progress response
        return jsonResponse({
          execution: {
            id: executionId,
            workflowId,
            status: 'running',
            startedAt: new Date().toISOString(),
            completedAt: null,
            executionDetails: null,
          },
          progress: {
            status: 'running',
            currentNodeId: null,
            currentNodeName: 'Initializing...',
            currentNode: null,
            completedNodes: [],
            failedNodes: [],
            totalNodes: 0,
            progressPercentage: 0,
            errorMessage: null,
          },
          workflow: {
            nodes: [],
            connections: [],
          }
        })
      }

      return errorResponse('Failed to fetch execution progress' , 500)
    }

    if (!progress) {
      // No progress record yet, return default
      logger.debug('No progress record found yet for execution:', executionId)

      return jsonResponse({
        execution: {
          id: executionId,
          workflowId,
          status: 'pending',
          startedAt: new Date().toISOString(),
          completedAt: null,
          executionDetails: null,
        },
        progress: {
          status: 'pending',
          currentNodeId: null,
          currentNodeName: 'Starting...',
          currentNode: null,
          completedNodes: [],
          failedNodes: [],
          totalNodes: 0,
          progressPercentage: 0,
          errorMessage: null,
        },
        workflow: {
          nodes: [],
          connections: [],
        }
      })
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
    const nodeOutputs = progress.node_outputs || {}
    const currentNode = progress.current_node_id
      ? workflow?.nodes?.find((n: any) => n.id === progress.current_node_id)
      : null

    // Get backend logs for this execution
    const backendLogs = backendLogger.getLogs(executionId, lastLogTimestamp || undefined)

    return jsonResponse({
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
        nodeOutputs,
        totalNodes,
        progressPercentage: progress.progress_percentage,
        errorMessage: progress.error_message,
      },
      workflow: {
        nodes: workflow?.nodes || [],
        connections: workflow?.connections || [],
      },
      backendLogs, // Include backend logs for debug modal
    })
  } catch (error: any) {
    logger.error('Error getting execution status:', error)
    return errorResponse(error.message || 'Failed to get execution status' , 500)
  }
}
