import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { TriggerLifecycleManager } from '@/lib/triggers/TriggerLifecycleManager'
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

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const { workflowId, nodeId } = await request.json()

    if (!workflowId || !nodeId) {
      return errorResponse("Workflow ID and Node ID are required", 400)
    }

    // Get workflow and verify ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found", 404)
    }

    // Find the trigger node
    const nodes = workflow.nodes || []
    const triggerNode = nodes.find((n: any) => n.id === nodeId && n.data?.isTrigger)

    if (!triggerNode) {
      return errorResponse("Trigger node not found", 404)
    }

    const providerId = triggerNode.data?.providerId
    const triggerType = triggerNode.data?.type
    const config = triggerNode.data?.config || {}

    if (!providerId || !triggerType) {
      return errorResponse("Invalid trigger configuration", 400)
    }

    logger.debug(`🧪 Testing trigger for workflow ${workflowId}`, {
      nodeId,
      providerId,
      triggerType
    })

    // Import trigger lifecycle manager
    const { triggerManager } = await import('@/lib/triggers')

    // Temporarily activate the trigger
    const activationContext = {
      workflowId,
      userId: user.id,
      nodeId,
      triggerType,
      providerId,
      config: {
        ...config,
        testMode: true // Mark this as a test activation
      }
    }

    try {
      // Activate trigger (creates webhook/subscription)
      await triggerManager.activateWorkflowTriggers(workflowId, user.id, [triggerNode])

      logger.debug(`✅ Trigger activated for testing, polling for events...`)

      // Poll for trigger event
      const startTime = Date.now()
      let eventData = null

      while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
        // Check for recent workflow executions triggered by this webhook
        const { data: executions } = await supabase
          .from('workflow_executions')
          .select('*')
          .eq('workflow_id', workflowId)
          .eq('trigger_type', 'webhook')
          .gte('created_at', new Date(startTime).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        if (executions && executions.length > 0) {
          eventData = executions[0].input_data
          logger.debug(`✅ Trigger event received!`, { eventData })
          break
        }

        // Also check trigger_resources for webhook calls
        const { data: triggerResources } = await supabase
          .from('trigger_resources')
          .select('config')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .eq('status', 'active')
          .single()

        if (triggerResources?.config?.lastTestEvent) {
          eventData = triggerResources.config.lastTestEvent
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

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }

      // Deactivate trigger after test
      await triggerManager.deactivateWorkflowTriggers(workflowId, user.id)
      logger.debug(`🛑 Test trigger deactivated`)

      if (eventData) {
        return jsonResponse({
          success: true,
          eventReceived: true,
          data: eventData,
          message: "Trigger event received successfully"
        })
      } else {
        return jsonResponse({
          success: true,
          eventReceived: false,
          message: `No event received within ${MAX_WAIT_TIME_MS / 1000} seconds. Please trigger the event manually.`,
          webhookUrl: triggerResources?.config?.webhookUrl
        })
      }

    } catch (error: any) {
      // Make sure to deactivate trigger even if error occurs
      try {
        await triggerManager.deactivateWorkflowTriggers(workflowId, user.id)
      } catch (deactivateError) {
        logger.error('Failed to deactivate trigger after error', deactivateError)
      }

      throw error
    }

  } catch (error: any) {
    logger.error("Test trigger error:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
}
