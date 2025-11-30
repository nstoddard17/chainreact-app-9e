import { NextRequest } from 'next/server'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * Test Trigger API
 *
 * Temporarily activates a trigger, waits for an event, then deactivates it.
 * Used for testing triggers during workflow development.
 *
 * Flow:
 * 1. Client initiates test (POST with workflowId, nodeId)
 * 2. Server activates trigger temporarily
 * 3. Server polls for trigger event (with timeout)
 * 4. Server returns event data or timeout
 * 5. Server deactivates trigger
 */

const POLL_INTERVAL_MS = 2000 // Check every 2 seconds
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

    if (!workflowId || !nodeId) {
      console.log('🧪 [test-trigger] Missing required fields')
      return errorResponse("Workflow ID and Node ID are required", 400)
    }

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
      console.log('🧪 [test-trigger] Fetching workflow from database...', { workflowId, userId: user.id })

      const { data: workflow, error: workflowError } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", workflowId)
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

    logger.debug(`🧪 Testing trigger for workflow ${workflowId}`, {
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
    const testSessionId = `test-${workflowId}-${Date.now()}`
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
          workflow_id: workflowId,
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

      if (sessionError) {
        console.log('🧪 [test-trigger] Warning: Could not create test session (table may not exist):', sessionError.message)
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
        workflowId,
        user.id,
        [triggerNode],
        { isTest: true, testSessionId }
      )

      console.log('🧪 [test-trigger] ✅ Trigger activated successfully!')
      logger.debug(`✅ Trigger activated for testing, polling for events...`)

      // Check what was created in trigger_resources
      const { data: createdResources } = await supabase
        .from('trigger_resources')
        .select('*')
        .eq('workflow_id', workflowId)
      console.log('🧪 [test-trigger] Created trigger resources:', createdResources)

      // Poll for trigger event
      const startTime = Date.now()
      let eventData = null
      let pollCount = 0
      let executionId: string | null = null

      console.log('🧪 [test-trigger] Starting to poll for events...')

      while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
        pollCount++
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        console.log(`🧪 [test-trigger] Poll #${pollCount} (${elapsed}s elapsed)`)

        // PRIORITY 1: Check if test session status changed to 'executing' (set by Gmail/webhook processors)
        const { data: testSession } = await supabase
          .from('workflow_test_sessions')
          .select('status, execution_id')
          .eq('id', testSessionId)
          .maybeSingle()

        if (testSession?.status === 'executing' && testSession?.execution_id) {
          console.log('🧪 [test-trigger] ✅ Test session is executing!', { executionId: testSession.execution_id })
          executionId = testSession.execution_id

          // Get the execution details
          const { data: execution } = await supabase
            .from('workflow_executions')
            .select('*')
            .eq('id', executionId)
            .single()

          if (execution) {
            eventData = execution.input_data
            console.log('🧪 [test-trigger] ✅ Got execution data from test session!')
            logger.debug(`✅ Trigger event received via test session!`, { executionId, eventData })
            break
          }
        }

        // PRIORITY 2: Check for recent workflow executions triggered by this webhook
        const { data: executions } = await supabase
          .from('workflow_executions')
          .select('*')
          .eq('workflow_id', workflowId)
          .gte('created_at', new Date(startTime).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        if (executions && executions.length > 0) {
          eventData = executions[0].input_data
          executionId = executions[0].id
          console.log('🧪 [test-trigger] ✅ Event received via workflow execution!')
          logger.debug(`✅ Trigger event received!`, { eventData })
          break
        }

        // PRIORITY 3: Check trigger_resources for webhook calls
        const { data: triggerResources } = await supabase
          .from('trigger_resources')
          .select('config')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .eq('status', 'active')
          .maybeSingle()

        if (triggerResources?.config?.lastTestEvent) {
          eventData = triggerResources.config.lastTestEvent
          console.log('🧪 [test-trigger] ✅ Test event found in trigger resources!')
          logger.debug(`✅ Test event found in trigger resources!`, { eventData })

          // Clear the test event
          await supabase
            .from('trigger_resources')
            .update({
              config: {
                ...triggerResources.config,
                lastTestEvent: null
              }
            })
            .eq('workflow_id', workflowId)
            .eq('node_id', nodeId)

          break
        }

        // PRIORITY 4: Check webhook_events table for received events
        const { data: webhookEvents } = await supabase
          .from('webhook_events')
          .select('*')
          .eq('provider', providerId)
          .gte('timestamp', new Date(startTime).toISOString())
          .order('timestamp', { ascending: false })
          .limit(1)

        if (webhookEvents && webhookEvents.length > 0) {
          const webhookEvent = webhookEvents[0]
          eventData = webhookEvent.event_data
          console.log('🧪 [test-trigger] ✅ Event found in webhook_events!')
          logger.debug(`✅ Webhook event found!`, { eventId: webhookEvent.id, eventData })
          break
        }

        // PRIORITY 5: Check webhook_tasks table for queued events from this provider
        const { data: webhookTasks } = await supabase
          .from('webhook_tasks')
          .select('*')
          .eq('provider', providerId)
          .in('status', ['queued', 'processing', 'completed'])
          .gte('created_at', new Date(startTime).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        if (webhookTasks && webhookTasks.length > 0) {
          const task = webhookTasks[0]
          eventData = task.event_data
          console.log('🧪 [test-trigger] ✅ Event found in webhook_tasks!')
          logger.debug(`✅ Webhook task event found!`, { taskId: task.id, status: task.status, eventData })
          break
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }

      // Deactivate ONLY the test trigger (not production triggers)
      console.log('🧪 [test-trigger] Deactivating test trigger...')
      await triggerManager.deactivateWorkflowTriggers(workflowId, user.id, testSessionId)
      console.log('🧪 [test-trigger] 🛑 Test trigger deactivated (production triggers unaffected)')
      logger.debug(`🛑 Test trigger deactivated for session ${testSessionId}`)

      // Clean up test session
      console.log('🧪 [test-trigger] Cleaning up test session...')
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: eventData ? 'completed' : 'expired',
          ended_at: new Date().toISOString(),
        })
        .eq('id', testSessionId)

      if (eventData) {
        console.log('🧪 [test-trigger] Returning success with event data')
        return jsonResponse({
          success: true,
          eventReceived: true,
          data: eventData,
          message: "Trigger event received successfully"
        })
      } else {
        // Get webhook URL for display if no event received
        const { data: triggerResource } = await supabase
          .from('trigger_resources')
          .select('config')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .single()

        console.log('🧪 [test-trigger] No event received, returning timeout response')
        return jsonResponse({
          success: true,
          eventReceived: false,
          message: `No event received within ${MAX_WAIT_TIME_MS / 1000} seconds. Please trigger the event manually.`,
          webhookUrl: triggerResource?.config?.webhookUrl
        })
      }

    } catch (error: any) {
      console.error('🧪 [test-trigger] ❌ Error during trigger activation/polling:', error)
      // Make sure to deactivate test trigger even if error occurs
      try {
        await triggerManager.deactivateWorkflowTriggers(workflowId, user.id, testSessionId)
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
