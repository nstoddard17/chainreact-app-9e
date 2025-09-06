import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { createDataFlowManager } from "@/lib/workflows/dataFlowContext"
import { NodeExecutionService } from "./nodeExecutionService"

export interface ExecutionContext {
  userId: string
  workflowId: string
  testMode: boolean
  data: any
  variables: Record<string, any>
  results: Record<string, any>
  dataFlowManager: any
  interceptedActions?: any[]
}

export class WorkflowExecutionService {
  private nodeExecutionService: NodeExecutionService

  constructor() {
    this.nodeExecutionService = new NodeExecutionService()
  }

  async executeWorkflow(workflow: any, inputData: any, userId: string, testMode: boolean, workflowData?: any) {
    console.log("🚀 Starting workflow execution service")
    
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Use workflowData if provided (current state), otherwise fall back to saved workflow
    const allNodes = workflowData?.nodes || workflow.nodes || []
    const connections = workflowData?.connections || workflow.connections || []

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

    // Find trigger nodes (nodes with no incoming connections)
    const triggerNodes = nodes.filter((node: any) => 
      !validConnections.some((conn: any) => conn.target === node.id)
    )

    if (triggerNodes.length === 0) {
      throw new Error("Workflow has no trigger nodes")
    }

    // Initialize execution context
    const executionContext = await this.createExecutionContext(
      workflow, 
      inputData, 
      userId, 
      testMode, 
      supabase
    )

    // Execute from each trigger node
    const results = []
    executionContext.interceptedActions = []
    
    for (const triggerNode of triggerNodes) {
      console.log(`🎯 Executing trigger node: ${triggerNode.id} (${triggerNode.data.type})`)
      const result = await this.nodeExecutionService.executeNode(
        triggerNode, 
        nodes, 
        validConnections, 
        executionContext
      )
      
      // Collect intercepted actions from the result tree
      this.collectInterceptedActions(result, executionContext.interceptedActions)
      
      results.push(result)
    }

    console.log("✅ Workflow execution completed successfully")
    
    // If in test mode and we have intercepted actions, return them separately
    if (testMode && executionContext.interceptedActions.length > 0) {
      console.log(`📦 Returning ${executionContext.interceptedActions.length} intercepted actions`)
      return {
        results,
        interceptedActions: executionContext.interceptedActions
      }
    }
    
    return results
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