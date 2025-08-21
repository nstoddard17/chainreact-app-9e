import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { WorkflowExecutionService } from "@/lib/services/workflowExecutionService"

export async function POST(request: Request) {
  try {
    console.log("=== Workflow Execution Started (Refactored) ===")
    
    const body = await request.json()
    const { workflowId, testMode = false, inputData = {}, workflowData } = body
    
    console.log("Execution parameters:", {
      workflowId,
      testMode,
      hasInputData: !!inputData,
      hasWorkflowData: !!workflowData
    })

    if (!workflowId) {
      console.error("No workflowId provided")
      return NextResponse.json({ error: "workflowId is required" }, { status: 400 })
    }

    // Get the workflow from the database
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single()

    if (workflowError || !workflow) {
      console.error("Error fetching workflow:", workflowError)
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    console.log("Workflow found:", {
      id: workflow.id,
      name: workflow.name,
      nodesCount: workflow.nodes?.length || 0
    })

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error("User authentication error:", userError)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    // Parse workflow data
    const nodes = workflowData?.nodes || workflow.nodes || []
    const edges = workflowData?.edges || workflow.edges || []
    
    console.log("Workflow structure:", {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
    })

    if (nodes.length === 0) {
      console.error("No nodes found in workflow")
      return NextResponse.json({ error: "No nodes found in workflow" }, { status: 400 })
    }

    // Find trigger nodes
    const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)
    console.log("Trigger nodes found:", triggerNodes.length)

    if (triggerNodes.length === 0) {
      console.error("No trigger nodes found")
      return NextResponse.json({ error: "No trigger nodes found" }, { status: 400 })
    }

    // Execute the workflow using the new service
    console.log("Starting workflow execution with testMode:", testMode)
    
    const workflowExecutionService = new WorkflowExecutionService()
    const results = await workflowExecutionService.executeWorkflow(
      workflow, 
      inputData, 
      user.id, 
      testMode, 
      workflowData
    )
    
    console.log("Workflow execution completed successfully")

    return NextResponse.json({
      success: true,
      results: results,
      executionTime: new Date().toISOString()
    })

  } catch (error: any) {
    console.error("Workflow execution error:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return NextResponse.json({ 
      error: "Workflow execution failed", 
      details: error.message 
    }, { status: 500 })
  }
}