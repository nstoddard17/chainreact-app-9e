import { createSupabaseServerClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

/**
 * Interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  metadata?: Record<string, any>
  selectedPaths?: string[]
  message?: string
  error?: string
  pauseExecution?: boolean
}

/**
 * Executes a wait-for-event action in a workflow
 * Pauses the workflow execution until a specific event occurs
 */
export async function executeWaitForEvent(
  config: any,
  userId: string,
  input: Record<string, any>,
  context?: any
): Promise<ActionResult> {
  try {
    const eventType = config.eventType
    const matchCondition = config.matchCondition ? JSON.parse(config.matchCondition) : null
    const timeoutHours = config.timeout ? Number(config.timeout) : null

    if (!eventType) {
      throw new Error("Event type is required")
    }

    if (!context?.workflowId) {
      throw new Error("Workflow ID is required for wait-for-event actions")
    }

    if (!context?.executionId) {
      throw new Error("Execution ID is required for wait-for-event actions")
    }

    // Calculate timeout timestamp if specified
    const timeoutAt = timeoutHours
      ? new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString()
      : null

    // Create a waiting execution record
    const supabase = await createSupabaseServerClient()

    const { data: waitingRecord, error } = await supabase
      .from("waiting_executions")
      .insert({
        user_id: userId,
        workflow_id: context.workflowId,
        execution_id: context.executionId,
        node_id: context.nodeId,
        event_type: eventType,
        event_config: {
          eventType,
          webhookPath: config.webhookPath,
          eventName: config.eventName,
          provider: config.provider,
          integrationEvent: config.integrationEvent,
          matchCondition,
          timeoutAction: config.timeoutAction || 'fail'
        },
        match_condition: matchCondition,
        timeout_at: timeoutAt,
        status: "waiting",
        paused_at: new Date().toISOString(),
        execution_data: {
          input,
          resumeFrom: context.nodeId,
          allPreviousData: context.allPreviousData || {}
        }
      })
      .select()
      .single()

    if (error) {
      logger.error("Failed to create waiting execution:", error)
      throw new Error(`Failed to create waiting execution: ${error.message}`)
    }

    // Update the execution record to paused status
    await supabase
      .from("workflow_executions")
      .update({
        status: "waiting",
        paused_at: new Date().toISOString(),
        paused_reason: "wait_for_event",
        paused_data: {
          waiting_execution_id: waitingRecord.id,
          event_type: eventType,
          timeout_at: timeoutAt
        }
      })
      .eq('id', context.executionId)

    logger.info(`Workflow execution ${context.executionId} is now waiting for event: ${eventType}`)

    return {
      success: true,
      output: {
        ...input,
        waitingForEvent: true,
        waitingExecutionId: waitingRecord.id,
        eventType,
        pausedAt: new Date().toISOString(),
        timeoutAt
      },
      message: `Workflow paused - waiting for ${eventType} event${timeoutAt ? ` (timeout at ${new Date(timeoutAt).toLocaleString()})` : ''}`,
      // Special flag to indicate this execution should pause here
      pauseExecution: true
    }
  } catch (error: any) {
    logger.error("Wait for event execution error:", error)
    return {
      success: false,
      message: `Wait for event failed: ${error.message}`
    }
  }
}
