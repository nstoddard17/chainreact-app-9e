/**
 * Workflow Resume Service
 * Handles resuming paused workflows (primarily from HITL)
 */

import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface ResumeWorkflowResult {
  success: boolean
  executionId: string
  message: string
  resumed?: boolean
}

/**
 * Resume a paused workflow execution
 * This is called after HITL conversation completes or timeout
 */
export async function resumeWorkflowExecution(
  executionId: string
): Promise<ResumeWorkflowResult> {
  try {
    const supabase = await createSupabaseServerClient()

    // Get the paused execution
    const { data: execution, error: fetchError } = await supabase
      .from('workflow_executions')
      .select('*, workflows(id, name, workflow_json)')
      .eq('id', executionId)
      .eq('status', 'running') // Should be marked as running by webhook
      .single()

    if (fetchError || !execution) {
      logger.error('Failed to fetch execution for resume', {
        error: fetchError,
        executionId
      })
      return {
        success: false,
        executionId,
        message: 'Execution not found or not ready to resume'
      }
    }

    if (!execution.resume_data) {
      logger.error('No resume data found for execution', { executionId })
      return {
        success: false,
        executionId,
        message: 'No resume data available'
      }
    }

    const resumeData = execution.resume_data as any
    const pausedNodeId = resumeData.hitl_config ? execution.paused_node_id : null

    if (!pausedNodeId) {
      logger.warn('No paused node ID found', { executionId })
      return {
        success: false,
        executionId,
        message: 'Cannot determine where to resume from'
      }
    }

    // Get the workflow definition
    const workflow = execution.workflows as any
    if (!workflow || !workflow.workflow_json) {
      logger.error('Workflow definition not found', { executionId })
      return {
        success: false,
        executionId,
        message: 'Workflow definition not found'
      }
    }

    const workflowJson = workflow.workflow_json
    const nodes = workflowJson.nodes || []
    const edges = workflowJson.edges || workflowJson.connections || []

    // Find the paused node
    const pausedNode = nodes.find((n: any) => n.id === pausedNodeId)
    if (!pausedNode) {
      logger.error('Paused node not found in workflow', {
        executionId,
        pausedNodeId
      })
      return {
        success: false,
        executionId,
        message: 'Paused node not found in workflow definition'
      }
    }

    // Find next nodes to execute
    const nextNodes = edges
      .filter((e: any) => e.source === pausedNodeId)
      .map((e: any) => e.target)

    if (nextNodes.length === 0) {
      logger.info('No next nodes - workflow complete', { executionId })

      // Mark execution as completed
      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          paused_node_id: null,
          paused_at: null,
          completed_at: new Date().toISOString()
        })
        .eq('id', executionId)

      return {
        success: true,
        executionId,
        message: 'Workflow completed successfully',
        resumed: true
      }
    }

    // Trigger continuation
    // NOTE: This is a signal that execution should continue
    // Your workflow execution engine should pick this up
    logger.info('Workflow ready to resume', {
      executionId,
      pausedNodeId,
      nextNodes,
      output: resumeData.output
    })

    // Create a signal for the execution engine
    // Option 1: Use the existing execute-advanced API
    // Option 2: Create a dedicated resume queue
    // Option 3: Let a cron job pick this up

    // For now, we'll trigger via the execute API
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    try {
      const response = await fetch(`${baseUrl}/api/workflows/resume-execution`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          executionId,
          workflowId: workflow.id,
          userId: execution.user_id,
          resumeFrom: pausedNodeId,
          input: resumeData.output || {}
        })
      })

      if (!response.ok) {
        throw new Error(`Resume API failed: ${response.statusText}`)
      }

      logger.info('Workflow resume triggered successfully', { executionId })

      return {
        success: true,
        executionId,
        message: 'Workflow resumed successfully',
        resumed: true
      }

    } catch (apiError: any) {
      // If API call fails, log but don't fail completely
      // The cron job can pick it up
      logger.warn('Failed to trigger resume via API, will rely on cron', {
        error: apiError.message,
        executionId
      })

      return {
        success: true,
        executionId,
        message: 'Workflow marked for resume (will be picked up by cron)',
        resumed: false
      }
    }

  } catch (error: any) {
    logger.error('Error resuming workflow execution', {
      error: error.message,
      executionId
    })

    return {
      success: false,
      executionId,
      message: `Failed to resume: ${error.message}`
    }
  }
}

/**
 * Check for workflows that should resume and haven't been picked up
 * This is called by a cron job
 */
export async function checkAndResumeStuckWorkflows(): Promise<{
  checked: number
  resumed: number
  failed: number
}> {
  try {
    const supabase = await createSupabaseServerClient()

    // Find executions that are marked as running but still have paused_node_id
    // This means they're ready to resume but haven't been picked up yet
    const { data: stuckExecutions, error } = await supabase
      .from('workflow_executions')
      .select('id')
      .eq('status', 'running')
      .not('paused_node_id', 'is', null)
      .lt('paused_at', new Date(Date.now() - 60 * 1000).toISOString()) // Paused for at least 1 minute

    if (error) {
      logger.error('Failed to fetch stuck executions', { error })
      return { checked: 0, resumed: 0, failed: 0 }
    }

    if (!stuckExecutions || stuckExecutions.length === 0) {
      return { checked: 0, resumed: 0, failed: 0 }
    }

    logger.info('Found stuck executions', {
      count: stuckExecutions.length,
      ids: stuckExecutions.map(e => e.id)
    })

    let resumed = 0
    let failed = 0

    for (const execution of stuckExecutions) {
      const result = await resumeWorkflowExecution(execution.id)
      if (result.success && result.resumed) {
        resumed++
      } else {
        failed++
      }
    }

    return {
      checked: stuckExecutions.length,
      resumed,
      failed
    }

  } catch (error: any) {
    logger.error('Error checking stuck workflows', { error: error.message })
    return { checked: 0, resumed: 0, failed: 0 }
  }
}
