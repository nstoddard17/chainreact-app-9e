import { NextRequest } from 'next/server'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * Test Trigger API
 *
 * Temporarily activates a trigger and returns a test session ID.
 * Used for testing triggers during workflow development.
 *
 * Flow:
 * 1. Client initiates test (POST with workflowId, nodeId)
 * 2. Server activates trigger temporarily
 * 3. Client subscribes to SSE stream for trigger events
 * 4. Client deactivates trigger on completion/timeout
 */

const MAX_WAIT_TIME_MS = 60000 // Wait up to 60 seconds

// GET handler for debugging - verify route is accessible
export async function GET() {
  console.log('🧪 [test-trigger] GET request received (debug endpoint)')
  return jsonResponse({
    message: 'Test trigger endpoint is working',
    timestamp: new Date().toISOString()
  })
}

export async function POST(request: NextRequest) {
  console.log('🧪 [test-trigger] POST request received')

  const supabase = await createSupabaseRouteHandlerClient()
  console.log('🧪 [test-trigger] Supabase client created')

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    console.log('🧪 [test-trigger] Auth check:', { userId: user?.id, error: userError?.message })

    if (userError || !user) {
      console.log('🧪 [test-trigger] Not authenticated')
      return errorResponse("Not authenticated", 401)
    }

    const body = await request.json()
    const { workflowId, nodeId, nodes: providedNodes, connections: providedConnections } = body
    console.log('🧪 [test-trigger] Request body:', {
      workflowId,
      nodeId,
      hasProvidedNodes: !!providedNodes,
      providedNodesCount: providedNodes?.length,
      hasProvidedConnections: !!providedConnections,
      providedConnectionsCount: providedConnections?.length
    })

    if (!nodeId) {
      console.log('🧪 [test-trigger] Missing required field: nodeId')
      return errorResponse("Node ID is required", 400)
    }

    // Allow synthetic workflowId for TriggerTester (no real workflow)
    // This enables testing triggers without having a saved workflow
    const effectiveWorkflowId = workflowId || `tester-${user.id}-${Date.now()}`
    console.log('🧪 [test-trigger] Using workflowId:', { provided: workflowId, effective: effectiveWorkflowId })

    let nodes: any[] = []
    let connections: any[] = []
    let workflowName = 'Unsaved Workflow'

    // If nodes are provided directly, use them (for unsaved workflows)
    if (providedNodes && Array.isArray(providedNodes) && providedNodes.length > 0) {
      console.log('🧪 [test-trigger] Using provided nodes (unsaved workflow)')
      nodes = providedNodes
      connections = providedConnections || []
    } else {
      // Get workflow from database
      console.log('🧪 [test-trigger] Fetching workflow from database...', { effectiveWorkflowId, userId: user.id })

      const { data: workflow, error: workflowError } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", effectiveWorkflowId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (workflowError) {
        console.log('🧪 [test-trigger] Workflow query error:', workflowError.message)
        return errorResponse("Error fetching workflow", 500)
      }

      if (!workflow) {
        console.log('🧪 [test-trigger] Workflow not found in database and no nodes provided')
        return errorResponse("Workflow not found. Please save the workflow first or pass nodes in request.", 404)
      }

      console.log('🧪 [test-trigger] Workflow found:', workflow.name)
      nodes = workflow.nodes || []
      connections = workflow.connections || []
      workflowName = workflow.name
    }
    console.log('🧪 [test-trigger] Searching for trigger node in', nodes.length, 'nodes')

    // Log all nodes for debugging
    nodes.forEach((n: any, i: number) => {
      console.log(`🧪 [test-trigger] Node ${i}:`, {
        id: n.id,
        type: n.type,
        dataType: n.data?.type,
        isTrigger: n.data?.isTrigger,
        providerId: n.data?.providerId
      })
    })

    const triggerNode = nodes.find((n: any) => n.id === nodeId && n.data?.isTrigger)

    if (!triggerNode) {
      // Try finding without isTrigger check
      const anyMatchingNode = nodes.find((n: any) => n.id === nodeId)
      console.log('🧪 [test-trigger] Trigger node not found. Matching node by ID:', anyMatchingNode)
      return errorResponse("Trigger node not found", 404)
    }

    const providerId = triggerNode.data?.providerId
    const triggerType = triggerNode.data?.type
    const config = triggerNode.data?.config || {}

    console.log('🧪 [test-trigger] Trigger node details:', {
      nodeId: triggerNode.id,
      providerId,
      triggerType,
      configKeys: Object.keys(config),
      fullTriggerData: triggerNode.data
    })

    if (!providerId || !triggerType) {
      console.log('🧪 [test-trigger] Invalid trigger configuration - missing providerId or triggerType')
      return errorResponse("Invalid trigger configuration", 400)
    }

    logger.debug(`🧪 Testing trigger for workflow ${effectiveWorkflowId}`, {
      nodeId,
      providerId,
      triggerType
    })

    // Import trigger lifecycle manager
    console.log('🧪 [test-trigger] Importing trigger lifecycle manager...')
    const { triggerLifecycleManager: triggerManager } = await import('@/lib/triggers')

    // Check if provider is registered
    const registeredProviders = triggerManager.getRegisteredProviders()
    console.log('🧪 [test-trigger] Registered providers:', registeredProviders)

    const isProviderRegistered = registeredProviders.includes(providerId)
    console.log('🧪 [test-trigger] Is provider registered?', { providerId, isProviderRegistered })

    if (!isProviderRegistered) {
      console.log('🧪 [test-trigger] Provider not registered, will use default webhook behavior')
    }

    // Create a test session ID
    const testSessionId = `test-${effectiveWorkflowId}-${Date.now()}`
    const sessionTimeout = MAX_WAIT_TIME_MS + 10000 // Extra buffer for cleanup

    try {
      // Create a test session record BEFORE activating trigger
      // This allows webhook processors (like Gmail) to find and execute the workflow
      // IMPORTANT: Store workflow nodes in test_mode_config so processors can use them
      // even if the workflow hasn't been saved to the database yet
      console.log('🧪 [test-trigger] Creating test session:', testSessionId)
      const { error: sessionError } = await supabase
        .from('workflow_test_sessions')
        .insert({
          id: testSessionId,
          workflow_id: effectiveWorkflowId,
          user_id: user.id,
          status: 'listening',
          trigger_type: triggerType,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + sessionTimeout).toISOString(),
          // Store workflow config for unsaved workflows - processors can use this
          // instead of joining to the workflows table
          test_mode_config: {
            nodes,
            connections,
            workflowName,
            triggerNode,
          },
        })

      const testSessionCreated = !sessionError

      if (!testSessionCreated) {
        console.log('🧪 [test-trigger] Warning: Could not create test session (table may not exist):', sessionError.message)
        logger.warn('[test-trigger] Failed to create workflow_test_sessions row', {
          testSessionId,
          workflowId: effectiveWorkflowId,
          userId: user.id,
          error: sessionError,
        })
        // Continue anyway - we'll fall back to other polling methods
      } else {
        console.log('🧪 [test-trigger] ✅ Test session created successfully')
      }

      // Activate trigger with TEST MODE - creates isolated webhook subscription
      // that will NOT trigger production workflows
      console.log('🧪 [test-trigger] Activating trigger in TEST MODE...')
      console.log('🧪 [test-trigger] Trigger node being passed:', JSON.stringify(triggerNode, null, 2))
      console.log('🧪 [test-trigger] Test session ID:', testSessionId)

      // Pass test mode config to ensure separate webhook URL is used
      await triggerManager.activateWorkflowTriggers(
        effectiveWorkflowId,
        user.id,
        [triggerNode],
        { isTest: true, testSessionId }
      )

      console.log('🧪 [test-trigger] ✅ Trigger activated successfully!')
      logger.debug(`✅ Trigger activated for testing, waiting for SSE clients...`)

      const { data: triggerResource } = await supabase
        .from('trigger_resources')
        .select('config')
        .eq('workflow_id', effectiveWorkflowId)
        .eq('node_id', nodeId)
        .eq('status', 'active')
        .maybeSingle()

      return jsonResponse({
        success: true,
        testSessionId,
        workflowId: effectiveWorkflowId,
        status: 'listening',
        expiresAt: new Date(Date.now() + sessionTimeout).toISOString(),
        message: `Trigger activated. Waiting up to ${MAX_WAIT_TIME_MS / 1000} seconds for an event.`,
        webhookUrl: triggerResource?.config?.webhookUrl,
        sessionStored: testSessionCreated,
        sessionError: sessionError
          ? {
              message: sessionError.message,
              code: (sessionError as any).code,
              details: (sessionError as any).details,
              hint: (sessionError as any).hint,
            }
          : null
      })

    } catch (error: any) {
      console.error('🧪 [test-trigger] ❌ Error during trigger activation/polling:', error)
      // Make sure to deactivate test trigger even if error occurs
      try {
        await triggerManager.deactivateWorkflowTriggers(effectiveWorkflowId, user.id, testSessionId)
        console.log('🧪 [test-trigger] Test trigger deactivated after error')

        // Clean up test session on error
        await supabase
          .from('workflow_test_sessions')
          .update({
            status: 'failed',
            ended_at: new Date().toISOString(),
          })
          .eq('id', testSessionId)
      } catch (deactivateError) {
        console.error('🧪 [test-trigger] Failed to deactivate trigger after error:', deactivateError)
        logger.error('Failed to deactivate trigger after error', deactivateError)
      }

      throw error
    }

  } catch (error: any) {
    console.error('🧪 [test-trigger] ❌ Top-level error:', error)
    logger.error("Test trigger error:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
}

/**
 * DELETE handler - Stop a running test and deactivate webhooks
 *
 * Called when:
 * 1. User clicks "Stop" button during test
 * 2. Workflow execution completes via SSE
 */
export async function DELETE(request: NextRequest) {
  console.log('🧪 [test-trigger] DELETE request received')

  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const body = await request.json()
    const { workflowId, testSessionId } = body

    console.log('🧪 [test-trigger] DELETE request:', { workflowId, testSessionId })

    if (!workflowId || !testSessionId) {
      return errorResponse("Workflow ID and Test Session ID are required", 400)
    }

    // Import trigger lifecycle manager
    const { triggerLifecycleManager: triggerManager } = await import('@/lib/triggers')

    // Deactivate test trigger
    console.log('🧪 [test-trigger] Deactivating test trigger via DELETE...')
    await triggerManager.deactivateWorkflowTriggers(workflowId, user.id, testSessionId)
    console.log('🧪 [test-trigger] 🛑 Test trigger deactivated via DELETE')

    // Update test session status
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'cancelled',
        ended_at: new Date().toISOString(),
      })
      .eq('id', testSessionId)
      .eq('user_id', user.id)

    return jsonResponse({
      success: true,
      message: "Test stopped and webhook deactivated"
    })

  } catch (error: any) {
    console.error('🧪 [test-trigger] ❌ DELETE error:', error)
    logger.error("Test trigger DELETE error:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
}
