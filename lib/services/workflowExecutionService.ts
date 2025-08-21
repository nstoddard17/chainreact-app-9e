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
    const nodes = workflowData?.nodes || workflow.nodes || []
    const connections = workflowData?.connections || workflow.connections || []

    console.log("Executing workflow with:", {
      nodesCount: nodes.length,
      connectionsCount: connections.length,
      usingWorkflowData: !!workflowData,
      nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
    })

    if (nodes.length === 0) {
      throw new Error("Workflow has no nodes")
    }

    // Find trigger nodes (nodes with no incoming connections)
    const triggerNodes = nodes.filter((node: any) => 
      !connections.some((conn: any) => conn.target === node.id)
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
    for (const triggerNode of triggerNodes) {
      console.log(`🎯 Executing trigger node: ${triggerNode.id} (${triggerNode.data.type})`)
      const result = await this.nodeExecutionService.executeNode(
        triggerNode, 
        nodes, 
        connections, 
        executionContext
      )
      results.push(result)
    }

    console.log("✅ Workflow execution completed successfully")
    return results
  }

  private async createExecutionContext(
    workflow: any, 
    inputData: any, 
    userId: string, 
    testMode: boolean, 
    supabase: any
  ): Promise<ExecutionContext> {
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

    return executionContext
  }
}