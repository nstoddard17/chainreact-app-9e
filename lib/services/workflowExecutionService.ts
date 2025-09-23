import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { createDataFlowManager } from "@/lib/workflows/dataFlowContext"
import { NodeExecutionService } from "./nodeExecutionService"
import { executionHistoryService } from "./executionHistoryService"

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
    console.log("🚀 Starting workflow execution service")
    
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Use workflowData if provided (current state), otherwise fall back to saved workflow
    const allNodes = workflowData?.nodes || workflow.nodes || []
    // Handle both 'edges' (from UI) and 'connections' (from DB) naming
    const connections = workflowData?.edges || workflowData?.connections || workflow.connections || []

    // Filter out UI-only nodes and invalid nodes
    const validNodes = allNodes.filter((node: any) => {
      // Skip AddActionNodes - these are UI placeholders for adding new nodes
      if (node.type === 'addAction' || node.id?.startsWith('add-action-')) {
        console.log(`Skipping UI placeholder node: ${node.id}`)
        return false
      }
      
      // Skip InsertActionNodes - these are also UI placeholders
      if (node.type === 'insertAction') {
        console.log(`Skipping UI insert node: ${node.id}`)
        return false
      }
      
      // Skip nodes without proper data or type
      if (!node.data || !node.data.type) {
        console.warn(`Skipping invalid node ${node.id}: missing type or data`, node)
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

    console.log("Executing workflow with:", {
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
      // When skipping triggers (webhook already triggered), start from nodes connected to triggers
      const triggerNodes = nodes.filter((node: any) =>
        node.data?.isTrigger === true
      )

      // Find nodes that are directly connected from trigger nodes
      startingNodes = nodes.filter((node: any) => {
        // Don't include the trigger nodes themselves
        if (node.data?.isTrigger) return false

        // Check if this node is connected from a trigger
        return validConnections.some((conn: any) =>
          triggerNodes.some((trigger: any) => trigger.id === conn.source) &&
          conn.target === node.id
        )
      })

      if (startingNodes.length === 0) {
        console.log('No action nodes connected to triggers, workflow may be trigger-only')
        startingNodes = [] // Allow empty for trigger-only workflows
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
      console.error('Failed to start execution history tracking:', error)
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

    console.log(`📍 Starting execution with ${startingNodes.length} starting nodes`)
    if (startingNodes.length === 0 && skipTriggers) {
      console.log('⚠️ No action nodes found connected to triggers')
      // Log the trigger nodes and connections for debugging
      const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger === true)
      console.log(`   Found ${triggerNodes.length} trigger nodes`)
      triggerNodes.forEach((t: any) => {
        const connectedNodes = validConnections
          .filter((c: any) => c.source === t.id)
          .map((c: any) => nodes.find((n: any) => n.id === c.target))
          .filter(Boolean)
        console.log(`   Trigger ${t.id} connects to ${connectedNodes.length} nodes`)
      })
    }

    for (const startNode of startingNodes) {
      console.log(`🎯 Executing ${skipTriggers ? 'action' : 'trigger'} node: ${startNode.id} (${startNode.data.type})`)
      const result = await this.nodeExecutionService.executeNode(
        startNode,
        nodes,
        validConnections,
        executionContext
      )

      console.log(`   Node ${startNode.id} execution result:`, {
        success: result?.success,
        hasError: !!result?.error,
        hasResults: !!result?.results
      })

      // Collect intercepted actions from the result tree
      this.collectInterceptedActions(result, executionContext.interceptedActions)

      results.push(result)
    }

    console.log(`✅ Workflow execution completed with ${results.length} results`)

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
        console.error('Failed to complete execution history:', error)
      }
    }

    // If in test mode and we have intercepted actions, return them separately
    if (testMode && executionContext.interceptedActions.length > 0) {
      console.log(`📦 Returning ${executionContext.interceptedActions.length} intercepted actions`)
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
    console.log(`🔧 Creating execution context with userId: ${userId}`)
    
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

    console.log(`📊 Loaded ${variables?.length || 0} workflow variables`)
    console.log(`✅ Created execution context with userId: ${executionContext.userId}`)

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