import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { WorkflowExecutionService } from "@/lib/services/workflowExecutionService"
import { trackBetaTesterActivity } from "@/lib/utils/beta-tester-tracking"

import { logger } from '@/lib/utils/logger'

/**
 * Generate mock trigger data for sandbox mode testing
 */
function generateMockTriggerData(triggerType: string, userId: string): any {
  const timestamp = new Date().toISOString()

  switch (triggerType) {
    case 'gmail_trigger_new_email':
      return {
        email: {
          id: `mock_email_${Date.now()}`,
          subject: 'Test Email Subject',
          from: 'test@example.com',
          to: `user-${userId}@example.com`,
          body: 'This is a test email body for workflow execution.',
          timestamp,
          labels: ['INBOX'],
          unread: true
        }
      }

    case 'gmail_trigger_new_attachment':
      return {
        email: {
          id: `mock_email_${Date.now()}`,
          subject: 'Email with Attachment',
          from: 'test@example.com',
          attachments: [
            {
              filename: 'test-document.pdf',
              mimeType: 'application/pdf',
              size: 12345
            }
          ]
        }
      }

    case 'google_calendar_trigger_new_event':
      return {
        event: {
          id: `mock_event_${Date.now()}`,
          summary: 'Test Event',
          start: timestamp,
          end: new Date(Date.now() + 3600000).toISOString(),
          attendees: ['test@example.com']
        }
      }

    case 'discord_trigger_new_message':
      return {
        message: {
          id: `mock_message_${Date.now()}`,
          content: 'Test Discord message',
          author: 'TestUser',
          channelId: 'test-channel',
          timestamp
        }
      }

    default:
      // Generic mock data for unknown trigger types
      return {
        triggered: true,
        timestamp,
        testData: true,
        message: `Mock data for ${triggerType}`
      }
  }
}

export async function POST(request: Request) {
  try {
    logger.debug("=== Workflow Execution Started (Refactored) ===")

    // Check if request has a body
    const contentLength = request.headers.get('content-length')
    logger.debug(`📊 [Execute Route] Request content-length: ${contentLength}`)

    // Try to parse the JSON body with better error handling
    let body
    try {
      const text = await request.text()
      logger.debug(`📊 [Execute Route] Request body text length: ${text.length}`)

      if (!text || text.length === 0) {
        throw new Error("Empty request body received")
      }

      body = JSON.parse(text)
    } catch (parseError: any) {
      logger.error("❌ [Execute Route] Failed to parse request body:", parseError)
      return errorResponse("Invalid request body", 400, {
        details: parseError.message,
        received: typeof text !== 'undefined' ? text.substring(0, 100) : 'undefined'
      })
    }

    const {
      workflowId,
      testMode = false,
      executionMode,
      inputData = {},
      workflowData,
      skipTriggers = false,
      testModeConfig // Enhanced test mode configuration
    } = body

    // Log the workflow data to see what nodes we're getting
    logger.debug("📊 [Execute Route] Workflow data received:", {
      workflowId,
      hasWorkflowData: !!workflowData,
      nodesCount: workflowData?.nodes?.length || 0,
      nodeTypes: workflowData?.nodes?.map((n: any) => ({ id: n.id, type: n.data?.type })) || [],
      hasTestModeConfig: !!testModeConfig,
      testModeConfig
    })

    // Determine execution mode
    // - 'sandbox': Test mode with no external calls (testMode = true)
    // - 'live': Execute with real external calls (testMode = false)
    // - undefined/legacy: Use testMode as-is for backward compatibility
    const effectiveTestMode = executionMode === 'sandbox' ? true :
                             executionMode === 'live' ? false :
                             testMode

    logger.debug("Execution parameters:", {
      workflowId,
      testMode,
      executionMode,
      effectiveTestMode,
      skipTriggers,
      hasInputData: !!inputData,
      hasWorkflowData: !!workflowData
    })

    if (!workflowId) {
      logger.error("No workflowId provided")
      return errorResponse("workflowId is required" , 400)
    }

    // Determine if this is a webhook request (has x-user-id header)
    const isWebhookRequest = !!request.headers.get('x-user-id')

    // Get the workflow from the database - use service client for webhooks to bypass RLS
    const supabase = isWebhookRequest
      ? await createSupabaseServiceClient()
      : await createSupabaseRouteHandlerClient()
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single()

    if (workflowError || !workflow) {
      logger.error("Error fetching workflow:", workflowError)
      return errorResponse("Workflow not found" , 404)
    }

    logger.debug("Workflow found:", {
      id: workflow.id,
      name: workflow.name,
      nodesCount: workflow.nodes?.length || 0
    })

    // Get the current user - either from auth session or x-user-id header (for webhooks)
    const userIdFromHeader = request.headers.get('x-user-id')
    let userId: string

    if (userIdFromHeader) {
      // Webhook-triggered execution - use user ID from header
      logger.debug("Using user ID from x-user-id header:", userIdFromHeader)
      userId = userIdFromHeader

      // Verify the user exists and owns the workflow
      if (workflow.user_id !== userId) {
        logger.error("User ID mismatch:", { headerUserId: userId, workflowUserId: workflow.user_id })
        return errorResponse("Unauthorized" , 403)
      }
    } else {
      // Normal authenticated execution
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        logger.error("User authentication error:", userError)
        return errorResponse("Not authenticated" , 401)
      }
      userId = user.id
    }

    logger.debug("User authenticated:", userId)

    // Parse workflow data
    const allNodes = workflowData?.nodes || workflow.nodes || []
    const allEdges = workflowData?.edges || workflow.edges || []
    
    // Log Google Calendar node config if present
    const calendarNode = allNodes.find((n: any) => n.data?.type === 'google_calendar_action_create_event')
    if (calendarNode) {
      logger.debug('📅 [Execute Route] Google Calendar node config received:', {
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
      logger.debug('📊 [Execute Route] Google Sheets node config received:', {
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
        logger.debug(`Skipping trigger node: ${node.id} (${node.data?.type})`)
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
    
    logger.debug("Workflow structure:", {
      originalNodesCount: allNodes.length,
      filteredNodesCount: nodes.length,
      skippedUINodes: allNodes.length - nodes.length,
      edgesCount: edges.length,
      nodeTypes: nodes.map((n: any) => n.data?.type).filter(Boolean)
    })

    if (nodes.length === 0) {
      logger.error("No nodes found in workflow")
      return errorResponse("No nodes found in workflow" , 400)
    }

    // Find trigger nodes (unless we're skipping them)
    if (!skipTriggers) {
      const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)
      logger.debug("Trigger nodes found:", triggerNodes.length)

      if (triggerNodes.length === 0) {
        logger.error("No trigger nodes found")
        return errorResponse("No trigger nodes found" , 400)
      }
    } else {
      // When skipping triggers, ensure we have at least one action node
      const actionNodes = nodes.filter((node: any) => !node.data?.isTrigger)
      logger.debug("Action nodes found (triggers skipped):", actionNodes.length)

      if (actionNodes.length === 0) {
        logger.error("No action nodes found")
        return errorResponse("No action nodes found" , 400)
      }
    }

    // Execute the workflow using the new service or advanced engine based on mode
    logger.debug("Starting workflow execution with effectiveTestMode:", effectiveTestMode, "executionMode:", executionMode)

    // Use advanced execution engine for live mode to enable parallel processing
    if (executionMode === 'live' || executionMode === 'sequential') {
      const { AdvancedExecutionEngine } = require("@/lib/execution/advancedExecutionEngine")
      const executionEngine = new AdvancedExecutionEngine()

      // Create execution session
      const executionSession = await executionEngine.createExecutionSession(
        workflowId,
        userId,
        "manual",
        {
          inputData,
          executionMode,
          workflowData: workflowData || workflow
        }
      )

      // Execute with parallel or sequential based on mode
      const executionResult = await executionEngine.executeWorkflowAdvanced(
        executionSession.id,
        inputData,
        {
          enableParallel: executionMode === 'live', // Parallel for live, sequential for debug
          maxConcurrency: executionMode === 'live' ? 5 : 1, // 5 parallel nodes for live, 1 for sequential
          enableSubWorkflows: true,
          testMode: false // Live mode uses real actions
        }
      )

      logger.debug("Advanced workflow execution completed")

      return jsonResponse({
        success: true,
        results: executionResult,
        executionTime: new Date().toISOString(),
        sessionId: executionSession.id,
        executionMode
      })
    }

    // Use standard service for sandbox mode (intercepted actions)
    const workflowExecutionService = new WorkflowExecutionService()

    // Pass filtered workflow data with correct property names
    const filteredWorkflowData = workflowData ? {
      ...workflowData,
      nodes: nodes,
      edges: edges,
      connections: edges // Some parts of the code use 'connections' instead of 'edges'
    } : null

    // Generate mock trigger data when in sandbox mode with skipTriggers
    let effectiveInputData = inputData
    if (effectiveTestMode && skipTriggers && (!inputData || Object.keys(inputData).length === 0)) {
      // Find the trigger node that was skipped to determine what mock data to provide
      const triggerNode = allNodes.find((n: any) => n.data?.isTrigger)
      if (triggerNode) {
        logger.debug('📦 Generating mock trigger data for:', triggerNode.data?.type)
        effectiveInputData = generateMockTriggerData(triggerNode.data?.type, userId)
      }
    }

    const executionResult = await workflowExecutionService.executeWorkflow(
      workflow,
      effectiveInputData,
      userId,
      effectiveTestMode,
      filteredWorkflowData,
      skipTriggers,
      testModeConfig // Pass enhanced test mode config
    )
    
    logger.debug("Workflow execution completed successfully")

    // Track beta tester activity
    await trackBetaTesterActivity({
      userId: userId,
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
      logger.debug(`Returning ${executionResult.interceptedActions.length} intercepted actions to frontend`)
      return jsonResponse({
        success: true,
        results: executionResult.results,
        interceptedActions: executionResult.interceptedActions,
        executionTime: new Date().toISOString()
      })
    }

    return jsonResponse({
      success: true,
      results: executionResult,
      executionTime: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error("Workflow execution error:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    // Return more detailed error information
    return errorResponse(error.message || "Workflow execution failed", 500, {
        details: error.stack,
        message: error.message 
      })
  }
}