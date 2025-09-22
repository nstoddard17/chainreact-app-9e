import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { WorkflowExecutionService } from "@/lib/services/workflowExecutionService"
import { trackBetaTesterActivity } from "@/lib/utils/beta-tester-tracking"

export async function POST(request: Request) {
  try {
    console.log("=== Workflow Execution Started (Refactored) ===")

    const body = await request.json()
    const { workflowId, testMode = false, executionMode, inputData = {}, workflowData, skipTriggers = false } = body
    
    // Log the workflow data to see what nodes we're getting
    console.log("📊 [Execute Route] Workflow data received:", {
      workflowId,
      hasWorkflowData: !!workflowData,
      nodesCount: workflowData?.nodes?.length || 0,
      nodeTypes: workflowData?.nodes?.map((n: any) => ({ id: n.id, type: n.data?.type })) || []
    })
    
    // Determine execution mode
    // - 'sandbox': Test mode with no external calls (testMode = true)
    // - 'live': Execute with real external calls (testMode = false)
    // - undefined/legacy: Use testMode as-is for backward compatibility
    const effectiveTestMode = executionMode === 'sandbox' ? true : 
                             executionMode === 'live' ? false : 
                             testMode
    
    console.log("Execution parameters:", {
      workflowId,
      testMode,
      executionMode,
      effectiveTestMode,
      skipTriggers,
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
    const allNodes = workflowData?.nodes || workflow.nodes || []
    const allEdges = workflowData?.edges || workflow.edges || []
    
    // Log Google Calendar node config if present
    const calendarNode = allNodes.find((n: any) => n.data?.type === 'google_calendar_action_create_event')
    if (calendarNode) {
      console.log('📅 [Execute Route] Google Calendar node config received:', {
        nodeId: calendarNode.id,
        hasConfig: !!calendarNode.data?.config,
        configKeys: Object.keys(calendarNode.data?.config || {}),
        title: calendarNode.data?.config?.title,
        startDate: calendarNode.data?.config?.startDate,
        allDay: calendarNode.data?.config?.allDay
      })
    }
    
    // Log Google Sheets node config if present
    const sheetsNode = allNodes.find((n: any) => n.data?.type === 'google_sheets_unified_action')
    if (sheetsNode) {
      console.log('📊 [Execute Route] Google Sheets node config received:', {
        nodeId: sheetsNode.id,
        hasConfig: !!sheetsNode.data?.config,
        configKeys: Object.keys(sheetsNode.data?.config || {}),
        action: sheetsNode.data?.config?.action,
        updateMapping: sheetsNode.data?.config?.updateMapping,
        rowNumber: sheetsNode.data?.config?.rowNumber,
        findRowBy: sheetsNode.data?.config?.findRowBy,
        spreadsheetId: sheetsNode.data?.config?.spreadsheetId,
        sheetName: sheetsNode.data?.config?.sheetName,
        // Delete-specific fields
        deleteRowBy: sheetsNode.data?.config?.deleteRowBy,
        deleteColumn: sheetsNode.data?.config?.deleteColumn,
        deleteValue: sheetsNode.data?.config?.deleteValue,
        deleteRowNumber: sheetsNode.data?.config?.deleteRowNumber,
        deleteAll: sheetsNode.data?.config?.deleteAll,
        confirmDelete: sheetsNode.data?.config?.confirmDelete
      })
    }
    
    // Filter out UI-only nodes (AddActionNodes, InsertActionNodes) and optionally triggers
    const nodes = allNodes.filter((node: any) => {
      // Skip UI placeholder nodes
      if (node.type === 'addAction' || node.type === 'insertAction' || node.id?.startsWith('add-action-')) {
        return false
      }
      // Skip trigger nodes if requested (for Run Once Live mode)
      if (skipTriggers && node.data?.isTrigger) {
        console.log(`Skipping trigger node: ${node.id} (${node.data?.type})`)
        return false
      }
      return true
    })
    
    // Filter edges to only include valid nodes
    const edges = allEdges.filter((edge: any) => {
      const sourceNode = nodes.find((n: any) => n.id === edge.source)
      const targetNode = nodes.find((n: any) => n.id === edge.target)
      return sourceNode && targetNode
    })
    
    console.log("Workflow structure:", {
      originalNodesCount: allNodes.length,
      filteredNodesCount: nodes.length,
      skippedUINodes: allNodes.length - nodes.length,
      edgesCount: edges.length,
      nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
    })

    if (nodes.length === 0) {
      console.error("No nodes found in workflow")
      return NextResponse.json({ error: "No nodes found in workflow" }, { status: 400 })
    }

    // Find trigger nodes (unless we're skipping them)
    if (!skipTriggers) {
      const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)
      console.log("Trigger nodes found:", triggerNodes.length)

      if (triggerNodes.length === 0) {
        console.error("No trigger nodes found")
        return NextResponse.json({ error: "No trigger nodes found" }, { status: 400 })
      }
    } else {
      // When skipping triggers, ensure we have at least one action node
      const actionNodes = nodes.filter((node: any) => !node.data?.isTrigger)
      console.log("Action nodes found (triggers skipped):", actionNodes.length)

      if (actionNodes.length === 0) {
        console.error("No action nodes found")
        return NextResponse.json({ error: "No action nodes found" }, { status: 400 })
      }
    }

    // Execute the workflow using the new service
    console.log("Starting workflow execution with effectiveTestMode:", effectiveTestMode, "executionMode:", executionMode)
    
    const workflowExecutionService = new WorkflowExecutionService()
    
    // Pass filtered workflow data with correct property names
    const filteredWorkflowData = workflowData ? {
      ...workflowData,
      nodes: nodes,
      edges: edges,
      connections: edges // Some parts of the code use 'connections' instead of 'edges'
    } : null
    
    const executionResult = await workflowExecutionService.executeWorkflow(
      workflow,
      inputData,
      user.id,
      effectiveTestMode,
      filteredWorkflowData,
      skipTriggers
    )
    
    console.log("Workflow execution completed successfully")

    // Track beta tester activity
    await trackBetaTesterActivity({
      userId: user.id,
      activityType: 'workflow_executed',
      activityData: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        testMode: effectiveTestMode,
        executionMode
      }
    })

    // Check if we have intercepted actions (sandbox mode)
    if (executionResult && typeof executionResult === 'object' && 'interceptedActions' in executionResult) {
      console.log(`Returning ${executionResult.interceptedActions.length} intercepted actions to frontend`)
      return NextResponse.json({
        success: true,
        results: executionResult.results,
        interceptedActions: executionResult.interceptedActions,
        executionTime: new Date().toISOString()
      })
    }

    return NextResponse.json({
      success: true,
      results: executionResult,
      executionTime: new Date().toISOString()
    })

  } catch (error: any) {
    console.error("Workflow execution error:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    // Return more detailed error information
    return NextResponse.json({ 
      error: error.message || "Workflow execution failed", 
      details: error.stack,
      message: error.message 
    }, { status: 500 })
  }
}