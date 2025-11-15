/**
 * Receive events and resume waiting workflows
 * This endpoint handles incoming events (webhooks, custom events, integration events)
 * and matches them to waiting workflow executions to resume
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { NodeExecutionService } from '@/lib/services/nodeExecutionService'
import { ExecutionProgressTracker } from '@/lib/execution/executionProgressTracker'
import { createDataFlowManager } from '@/lib/workflows/dataFlowContext'

/**
 * Check if event data matches the waiting execution's match condition
 */
function matchesCondition(eventData: any, matchCondition: any): boolean {
  if (!matchCondition) return true // No condition means match any event

  for (const [key, value] of Object.entries(matchCondition)) {
    // Support nested key access (e.g., "user.email")
    const eventValue = key.split('.').reduce((obj, k) => obj?.[k], eventData)

    if (typeof value === 'object' && value !== null) {
      // Handle operators like $exists, $ne, etc.
      if ('$exists' in value) {
        if (value.$exists && eventValue === undefined) return false
        if (!value.$exists && eventValue !== undefined) return false
      }
      if ('$ne' in value && eventValue === value.$ne) return false
      if ('$eq' in value && eventValue !== value.$eq) return false
    } else {
      // Simple equality check
      if (eventValue !== value) return false
    }
  }

  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventType, eventName, provider, eventData, webhookPath } = body

    logger.info('[Events] Received event', {
      eventType,
      eventName,
      provider,
      webhookPath,
      hasEventData: !!eventData
    })

    const supabase = await createSupabaseRouteHandlerClient()

    // Build query to find matching waiting executions
    let query = supabase
      .from('waiting_executions')
      .select('*')
      .eq('status', 'waiting')

    // Filter by event type
    if (eventType) {
      query = query.eq('event_type', eventType)
    }

    // Additional filtering based on event type
    if (eventType === 'webhook' && webhookPath) {
      query = query.contains('event_config', { webhookPath })
    } else if (eventType === 'custom_event' && eventName) {
      query = query.contains('event_config', { eventName })
    } else if (eventType === 'integration_event' && provider) {
      query = query.contains('event_config', { provider })
    }

    const { data: waitingExecutions, error } = await query

    if (error) {
      logger.error('[Events] Error querying waiting executions', { error })
      return NextResponse.json({ error: 'Failed to query waiting executions' }, { status: 500 })
    }

    if (!waitingExecutions || waitingExecutions.length === 0) {
      logger.info('[Events] No matching waiting executions found')
      return NextResponse.json({
        success: true,
        message: 'Event received but no waiting workflows matched',
        matched: 0
      })
    }

    logger.info(`[Events] Found ${waitingExecutions.length} potential matches`)

    // Filter by match condition and resume matching workflows
    const resumedExecutions = []
    const failedResumes = []

    for (const waiting of waitingExecutions) {
      try {
        // Check if event matches the condition
        if (!matchesCondition(eventData, waiting.match_condition)) {
          logger.debug(`[Events] Event doesn't match condition for execution ${waiting.execution_id}`)
          continue
        }

        logger.info(`[Events] Resuming execution ${waiting.execution_id}`)

        // Mark waiting execution as resumed
        await supabase
          .from('waiting_executions')
          .update({
            status: 'resumed',
            resumed_at: new Date().toISOString(),
            resume_event_data: eventData
          })
          .eq('id', waiting.id)

        // Load workflow
        const { data: workflow, error: workflowError } = await supabase
          .from('workflows')
          .select('*')
          .eq('id', waiting.workflow_id)
          .single()

        if (workflowError || !workflow) {
          logger.error(`[Events] Workflow not found for execution ${waiting.execution_id}`)
          failedResumes.push({
            executionId: waiting.execution_id,
            error: 'Workflow not found'
          })
          continue
        }

        // Load the paused execution
        const { data: execution, error: execError } = await supabase
          .from('workflow_executions')
          .select('*')
          .eq('id', waiting.execution_id)
          .single()

        if (execError || !execution) {
          logger.error(`[Events] Execution not found: ${waiting.execution_id}`)
          failedResumes.push({
            executionId: waiting.execution_id,
            error: 'Execution not found'
          })
          continue
        }

        // Get resume data from waiting execution
        const resumeData = waiting.execution_data || {}
        const pausedNodeId = waiting.node_id

        // Parse workflow nodes and edges
        const allNodes = workflow.nodes || []
        const allEdges = workflow.edges || workflow.connections || []

        const nodes = allNodes.filter((node: any) => {
          return node.type !== 'addAction' &&
                 node.type !== 'insertAction' &&
                 !node.id?.startsWith('add-action-')
        })

        const edges = allEdges.filter((edge: any) => {
          const sourceNode = nodes.find((n: any) => n.id === edge.source)
          const targetNode = nodes.find((n: any) => n.id === edge.target)
          return sourceNode && targetNode
        })

        // Find nodes that come after the paused node
        const nextNodes = edges
          .filter((edge: any) => edge.source === pausedNodeId)
          .map((edge: any) => nodes.find((n: any) => n.id === edge.target))
          .filter(Boolean)

        if (nextNodes.length === 0) {
          logger.info(`[Events] No more nodes after wait node - marking as completed`)

          await supabase
            .from('workflow_executions')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', waiting.execution_id)

          resumedExecutions.push({
            executionId: waiting.execution_id,
            completed: true
          })
          continue
        }

        // Initialize progress tracker
        const progressTracker = new ExecutionProgressTracker()
        await progressTracker.initialize(waiting.execution_id, waiting.workflow_id, waiting.user_id, nodes.length)

        // Create execution context with event data
        const dataFlowManager = createDataFlowManager(waiting.execution_id, waiting.workflow_id, waiting.user_id)

        const executionContext = {
          userId: waiting.user_id,
          workflowId: waiting.workflow_id,
          testMode: false,
          data: {
            ...resumeData.input,                    // Original input
            ...resumeData.allPreviousData,          // All previous node outputs
            event: eventData,                       // Event data that resumed workflow
            waitDuration: Date.now() - new Date(waiting.paused_at).getTime()
          },
          variables: {},
          results: {},
          dataFlowManager,
          executionId: waiting.execution_id
        }

        // Load workflow variables
        const { data: variables } = await supabase
          .from('workflow_variables')
          .select('*')
          .eq('workflow_id', waiting.workflow_id)

        if (variables) {
          variables.forEach((variable: any) => {
            executionContext.variables[variable.name] = variable.value
          })
        }

        // Update execution status to running
        await supabase
          .from('workflow_executions')
          .update({
            status: 'running',
            paused_at: null,
            paused_reason: null,
            paused_data: null
          })
          .eq('id', waiting.execution_id)

        // Execute the next nodes
        const nodeExecutionService = new NodeExecutionService()
        const completedNodeIds: string[] = []
        const failedNodeIds: Array<{ nodeId: string; error: string }> = []

        for (const nextNode of nextNodes) {
          logger.info(`[Events] Executing next node: ${nextNode.id} (${nextNode.data.type})`)

          await progressTracker.update({
            currentNodeId: nextNode.id,
            currentNodeName: nextNode.data.title || nextNode.data.type,
            progressPercentage: Math.round((completedNodeIds.length / nextNodes.length) * 100)
          })

          const result = await nodeExecutionService.executeNode(
            nextNode,
            nodes,
            edges,
            executionContext
          )

          // Check if another node is requesting pause
          if (result?.pauseExecution) {
            logger.info(`[Events] Workflow paused again at node ${nextNode.id}`)
            await progressTracker.pause(nextNode.id, nextNode.data.title || 'Workflow paused')
            break
          }

          if (result?.error) {
            failedNodeIds.push({ nodeId: nextNode.id, error: result.error })
          } else {
            completedNodeIds.push(nextNode.id)
          }

          await progressTracker.update({
            completedNodes: completedNodeIds,
            failedNodes: failedNodeIds,
            progressPercentage: Math.round((completedNodeIds.length / nextNodes.length) * 100)
          })
        }

        // Mark execution as completed if not paused again
        const hasErrors = failedNodeIds.length > 0
        await progressTracker.complete(!hasErrors, hasErrors ? 'Workflow resumed with errors' : undefined)

        await supabase
          .from('workflow_executions')
          .update({
            status: hasErrors ? 'failed' : 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', waiting.execution_id)

        resumedExecutions.push({
          executionId: waiting.execution_id,
          completed: true,
          hadErrors: hasErrors
        })

      } catch (error: any) {
        logger.error(`[Events] Error resuming execution ${waiting.execution_id}`, { error: error.message })
        failedResumes.push({
          executionId: waiting.execution_id,
          error: error.message
        })
      }
    }

    logger.info('[Events] Event processing complete', {
      resumed: resumedExecutions.length,
      failed: failedResumes.length
    })

    return NextResponse.json({
      success: true,
      message: `Event processed - resumed ${resumedExecutions.length} workflows`,
      resumed: resumedExecutions.length,
      failed: failedResumes.length,
      details: {
        resumedExecutions,
        failedResumes
      }
    })

  } catch (error: any) {
    logger.error('[Events] Error processing event', { error: error.message, stack: error.stack })
    return NextResponse.json(
      { error: error.message || 'Failed to process event' },
      { status: 500 }
    )
  }
}
