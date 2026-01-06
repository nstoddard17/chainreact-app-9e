/**
 * Resume a paused workflow execution
 * Used when HITL conversations complete and workflow should continue
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { NodeExecutionService } from '@/lib/services/nodeExecutionService'
import { executionHistoryService } from '@/lib/services/executionHistoryService'
import { ExecutionProgressTracker } from '@/lib/execution/executionProgressTracker'
import { createDataFlowManager } from '@/lib/workflows/dataFlowContext'

interface ResumeParams {
  params: {
    id: string
  }
}

export async function POST(
  request: NextRequest,
  { params }: ResumeParams
) {
  try {
    const workflowId = params.id
    const body = await request.json()
    const { executionId, conversationOutput, conversationId } = body

    logger.info('[Resume] Resuming workflow execution', {
      workflowId,
      executionId,
      conversationId
    })

    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load the paused execution from workflow_executions
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', executionId)
      .eq('status', 'paused')
      .single()

    if (execError || !execution) {
      logger.error('[Resume] Paused execution not found', { executionId, error: execError })
      return NextResponse.json(
        { error: 'Paused execution not found' },
        { status: 404 }
      )
    }

    // Load workflow metadata
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name, user_id')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      logger.error('[Resume] Workflow not found', { workflowId, error: workflowError })
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      )
    }

    // Get resume data (contains input data and context from when it paused)
    const resumeData = execution.resume_data || {}
    const pausedNodeId = execution.paused_node_id

    if (!pausedNodeId) {
      logger.error('[Resume] No paused node ID found in execution')
      return NextResponse.json(
        { error: 'Invalid paused execution state' },
        { status: 400 }
      )
    }

    logger.info('[Resume] Found paused execution', {
      pausedNodeId,
      hasResumeData: !!resumeData,
      hasConversationOutput: !!conversationOutput
    })

    // Load workflow nodes and edges from normalized tables
    const [nodesResult, edgesResult] = await Promise.all([
      supabase
        .from('workflow_nodes')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('display_order'),
      supabase
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', workflowId)
    ])

    const allNodes = (nodesResult.data || []).map((n: any) => ({
      id: n.id,
      type: n.node_type,
      position: { x: n.position_x, y: n.position_y },
      data: {
        type: n.node_type,
        label: n.label,
        config: n.config || {},
        isTrigger: n.is_trigger,
        providerId: n.provider_id
      }
    }))

    const allEdges = (edgesResult.data || []).map((e: any) => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      sourceHandle: e.source_port_id || 'source',
      targetHandle: e.target_port_id || 'target'
    }))

    // Filter out UI-only nodes
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

    logger.info('[Resume] Found next nodes to execute', {
      count: nextNodes.length,
      nodeIds: nextNodes.map((n: any) => n.id)
    })

    if (nextNodes.length === 0) {
      logger.info('[Resume] No more nodes to execute after paused node - workflow complete')

      // Mark execution as completed
      await supabase
        .from('workflow_executions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', executionId)

      return NextResponse.json({
        success: true,
        completed: true,
        message: 'Workflow completed - no more nodes to execute'
      })
    }

    // Initialize progress tracker
    const progressTracker = new ExecutionProgressTracker()
    await progressTracker.initialize(executionId, workflowId, user.id, nodes.length)

    // Create execution context with conversation output merged into input
    const dataFlowManager = createDataFlowManager(executionId, workflowId, user.id)

    const executionContext = {
      userId: user.id,
      workflowId,
      testMode: false,
      data: {
        ...resumeData.input,                              // Original workflow data
        ...conversationOutput,                             // HITL metadata (hitlStatus, summary, etc.)
        ...(conversationOutput.extractedVariables || {}),  // Extracted variables at top level for easy access
        // Also keep full conversation output for reference
        hitlConversation: conversationOutput
      },
      variables: {},
      results: {},
      dataFlowManager,
      executionId
    }

    // Load workflow variables
    const { data: variables } = await supabase
      .from('workflow_variables')
      .select('*')
      .eq('workflow_id', workflowId)

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
        paused_node_id: null,
        paused_at: null,
        resume_data: null
      })
      .eq('id', executionId)

    // Execute the next nodes
    const nodeExecutionService = new NodeExecutionService()
    const results = []
    const completedNodeIds: string[] = []
    const failedNodeIds: Array<{ nodeId: string; error: string }> = []

    for (const nextNode of nextNodes) {
      logger.info(`[Resume] Executing next node: ${nextNode.id} (${nextNode.data.type})`)

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
        logger.info(`[Resume] Workflow paused again at node ${nextNode.id}`)

        await progressTracker.pause(nextNode.id, nextNode.data.title || 'Human input required')

        return NextResponse.json({
          success: true,
          paused: true,
          pausedNodeId: nextNode.id,
          conversationId: result.output?.conversationId,
          results: [result]
        })
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

      results.push(result)
    }

    // Mark execution as completed
    const hasErrors = failedNodeIds.length > 0
    await progressTracker.complete(!hasErrors, hasErrors ? 'Workflow resumed with errors' : undefined)

    await supabase
      .from('workflow_executions')
      .update({
        status: hasErrors ? 'failed' : 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId)

    logger.info('[Resume] Workflow resumed and completed', {
      executionId,
      completedNodes: completedNodeIds.length,
      failedNodes: failedNodeIds.length
    })

    return NextResponse.json({
      success: true,
      completed: true,
      results,
      completedNodes: completedNodeIds,
      failedNodes: failedNodeIds
    })

  } catch (error: any) {
    logger.error('[Resume] Error resuming workflow', { error: error.message, stack: error.stack })
    return NextResponse.json(
      { error: error.message || 'Failed to resume workflow' },
      { status: 500 }
    )
  }
}
