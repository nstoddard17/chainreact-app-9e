import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { createDataFlowManager } from "@/lib/workflows/dataFlowContext"
import { NodeExecutionService } from "./nodeExecutionService"
import { executionHistoryService } from "./executionHistoryService"
import { ExecutionProgressTracker } from "@/lib/execution/executionProgressTracker"

import { logger } from '@/lib/utils/logger'

export interface ExecutionContext {
  userId: string
  workflowId: string
  testMode: boolean
  data: any
  variables: Record<string, any>
  results: Record<string, any>
  dataFlowManager: any
  interceptedActions?: any[]
  executionHistoryId?: string
  executionId?: string
}

export class WorkflowExecutionService {
  private nodeExecutionService: NodeExecutionService

  constructor() {
    this.nodeExecutionService = new NodeExecutionService()
  }

  async executeWorkflow(workflow: any, inputData: any, userId: string, testMode: boolean, workflowData?: any, skipTriggers: boolean = false) {
    logger.debug("🚀 Starting workflow execution service")
    
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Use workflowData if provided (current state), otherwise fall back to saved workflow
    const allNodes = workflowData?.nodes || workflow.nodes || []
    // Handle both 'edges' (from UI) and 'connections' (from DB) naming
    const connections = workflowData?.edges || workflowData?.connections || workflow.connections || []

    // Filter out UI-only nodes and invalid nodes
    const validNodes = allNodes.filter((node: any) => {
      // Skip AddActionNodes - these are UI placeholders for adding new nodes
      if (node.type === 'addAction' || node.id?.startsWith('add-action-')) {
        logger.debug(`Skipping UI placeholder node: ${node.id}`)
        return false
      }
      
      // Skip InsertActionNodes - these are also UI placeholders
      if (node.type === 'insertAction') {
        logger.debug(`Skipping UI insert node: ${node.id}`)
        return false
      }
      
      // Skip nodes without proper data or type
      if (!node.data || !node.data.type) {
        logger.warn(`Skipping invalid node ${node.id}: missing type or data`, node)
        return false
      }
      
      return true
    })

    // Also filter connections to only include valid nodes
    const validConnections = connections.filter((conn: any) => {
      const sourceValid = validNodes.some((n: any) => n.id === conn.source)
      const targetValid = validNodes.some((n: any) => n.id === conn.target)
      return sourceValid && targetValid
    })

    const nodes = validNodes

    logger.debug("Executing workflow with:", {
      originalNodesCount: allNodes.length,
      validNodesCount: nodes.length,
      skippedNodes: allNodes.length - nodes.length,
      connectionsCount: validConnections.length,
      usingWorkflowData: !!workflowData,
      nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
    })

    if (nodes.length === 0) {
      throw new Error("Workflow has no valid nodes to execute")
    }

    // Find starting nodes based on skipTriggers flag
    let startingNodes: any[]

    if (skipTriggers) {
      // When skipping triggers (Run Once, or external trigger already fired), prefer nodes connected from trigger(s)
      const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger === true)

      // Primary: nodes directly connected from any trigger
      startingNodes = nodes.filter((node: any) => {
        if (node.data?.isTrigger) return false
        return validConnections.some((conn: any) =>
          triggerNodes.some((trigger: any) => trigger.id === conn.source) &&
          conn.target === node.id
        )
      })

      if (startingNodes.length === 0) {
        // Fallback 1: if there are no triggers in the provided graph (e.g., triggers filtered out for Run Once),
        // start from root action nodes (those without incoming edges)
        if (triggerNodes.length === 0) {
          const hasIncoming = (nodeId: string) => validConnections.some((c: any) => c.target === nodeId)
          const rootActions = nodes.filter((n: any) => !n.data?.isTrigger && !hasIncoming(n.id))

          if (rootActions.length > 0) {
            logger.debug(`⚙️ Fallback: starting from ${rootActions.length} root action node(s) (no triggers present)`)
            startingNodes = rootActions
          } else {
            // Fallback 2: as a last resort, start from the first non-trigger node
            const firstAction = nodes.find((n: any) => !n.data?.isTrigger)
            if (firstAction) {
              logger.debug(`⚙️ Fallback: starting from first action node ${firstAction.id} (no roots found)`) 
              startingNodes = [firstAction]
            } else {
              logger.debug('⚠️ No action nodes available to execute when skipping triggers')
              startingNodes = []
            }
          }
        } else {
          logger.debug('No action nodes connected to triggers, workflow may be trigger-only')
          startingNodes = [] // Allow empty for trigger-only workflows
        }
      }
    } else {
      // Normal execution - start from trigger nodes
      startingNodes = nodes.filter((node: any) =>
        !validConnections.some((conn: any) => conn.target === node.id)
      )

      if (startingNodes.length === 0) {
        throw new Error("Workflow has no trigger nodes")
      }
    }

    // Generate execution ID
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Initialize progress tracker for live mode
    const progressTracker = new ExecutionProgressTracker()
    await progressTracker.initialize(executionId, workflow.id, userId, nodes.length)

    // Start execution history tracking
    let executionHistoryId: string | null = null
    try {
      executionHistoryId = await executionHistoryService.startExecution(
        workflow.id,
        userId,
        executionId,
        testMode,
        inputData
      )
    } catch (error) {
      logger.error('Failed to start execution history tracking:', error)
      // Continue execution even if history tracking fails
    }

    // Initialize execution context
    const executionContext = await this.createExecutionContext(
      workflow,
      inputData,
      userId,
      testMode,
      supabase
    )

    // Add execution tracking to context
    executionContext.executionHistoryId = executionHistoryId || undefined
    executionContext.executionId = executionId

    // Execute from each starting node
    const results = []
    executionContext.interceptedActions = []
    const completedNodeIds: string[] = []
    const failedNodeIds: Array<{ nodeId: string; error: string }> = []

    logger.debug(`📍 Starting execution with ${startingNodes.length} starting nodes`)
    if (startingNodes.length === 0 && skipTriggers) {
      logger.debug('⚠️ No action nodes found connected to triggers')
      // Log the trigger nodes and connections for debugging
      const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger === true)
      logger.debug(`   Found ${triggerNodes.length} trigger nodes`)
      triggerNodes.forEach((t: any) => {
        const connectedNodes = validConnections
          .filter((c: any) => c.source === t.id)
          .map((c: any) => nodes.find((n: any) => n.id === c.target))
          .filter(Boolean)
        logger.debug(`   Trigger ${t.id} connects to ${connectedNodes.length} nodes`)
      })
    }

    for (const startNode of startingNodes) {
      logger.debug(`🎯 Executing ${skipTriggers ? 'action' : 'trigger'} node: ${startNode.id} (${startNode.data.type})`)

      // Update progress: starting this node
      await progressTracker.update({
        currentNodeId: startNode.id,
        currentNodeName: startNode.data.title || startNode.data.type,
        progressPercentage: Math.round((completedNodeIds.length / nodes.length) * 100),
      })

      const result = await this.nodeExecutionService.executeNode(
        startNode,
        nodes,
        validConnections,
        executionContext
      )

      logger.debug(`   Node ${startNode.id} execution result:`, {
        success: result?.success,
        hasError: !!result?.error,
        hasResults: !!result?.results
      })

      // Track completion or failure
      if (result?.error) {
        failedNodeIds.push({ nodeId: startNode.id, error: result.error })
      } else {
        completedNodeIds.push(startNode.id)
      }

      // Update progress after node completion
      await progressTracker.update({
        completedNodes: completedNodeIds,
        failedNodes: failedNodeIds,
        progressPercentage: Math.round((completedNodeIds.length / nodes.length) * 100),
      })

      // Collect intercepted actions from the result tree
      this.collectInterceptedActions(result, executionContext.interceptedActions)

      results.push(result)
    }

    logger.debug(`✅ Workflow execution completed with ${results.length} results`)

    // Complete progress tracking
    const hasErrors = failedNodeIds.length > 0
    await progressTracker.complete(!hasErrors, hasErrors ? 'Workflow execution completed with errors' : undefined)

    // Complete execution history tracking
    if (executionHistoryId) {
      try {
        await executionHistoryService.completeExecution(
          executionHistoryId,
          'completed',
          results,
          undefined
        )
      } catch (error) {
        logger.error('Failed to complete execution history:', error)
      }
    }

    // If in test mode and we have intercepted actions, return them separately
    if (testMode && executionContext.interceptedActions.length > 0) {
      logger.debug(`📦 Returning ${executionContext.interceptedActions.length} intercepted actions`)
      return {
        results,
        interceptedActions: executionContext.interceptedActions,
        executionHistoryId
      }
    }

    return {
      results,
      executionHistoryId,
      success: true,
      executionId
    }
  }

  private async createExecutionContext(
    workflow: any, 
    inputData: any, 
    userId: string, 
    testMode: boolean, 
    supabase: any
  ): Promise<ExecutionContext> {
    logger.debug(`🔧 Creating execution context with userId: ${userId}`)
    
    // Initialize data flow manager
    const dataFlowManager = createDataFlowManager(`exec_${Date.now()}`, workflow.id, userId)
    
    const executionContext: ExecutionContext = {
      data: inputData,
      variables: {},
      results: {},
      testMode,
      userId,
      workflowId: workflow.id,
      dataFlowManager
    }

    // Load workflow variables
    const { data: variables } = await supabase
      .from("workflow_variables")
      .select("*")
      .eq("workflow_id", workflow.id)

    if (variables) {
      variables.forEach((variable: any) => {
        executionContext.variables[variable.name] = variable.value
      })
    }

    logger.debug(`📊 Loaded ${variables?.length || 0} workflow variables`)
    logger.debug(`✅ Created execution context with userId: ${executionContext.userId}`)

    return executionContext
  }

  private collectInterceptedActions(result: any, interceptedActions: any[]) {
    if (!result) return
    
    // Check if this result has intercepted data
    if (result.intercepted) {
      interceptedActions.push({
        nodeId: result.intercepted.nodeId,
        nodeName: result.intercepted.nodeName,
        type: result.intercepted.type,
        timestamp: new Date().toISOString(),
        config: result.intercepted.config,
        wouldHaveSent: result.intercepted.wouldHaveSent,
        sandbox: true
      })
    }
    
    // Recursively check nested results
    if (result.results && Array.isArray(result.results)) {
      for (const nestedResult of result.results) {
        this.collectInterceptedActions(nestedResult, interceptedActions)
      }
    }
  }
}