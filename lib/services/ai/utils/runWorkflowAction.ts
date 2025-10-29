import type { ActionResult } from "@/lib/workflows/actions/core/executeWait"

let executeActionRef: typeof import("@/lib/workflows/executeNode")["executeAction"] | null = null

async function getExecuteAction() {
  if (!executeActionRef) {
    const executeNodeModule = await import("@/lib/workflows/executeNode")
    executeActionRef = executeNodeModule.executeAction
  }

  return executeActionRef
}

interface RunActionOptions {
  workflowId?: string
  executionId?: string
  trigger?: Record<string, any>
  previousResults?: Record<string, any>
  testMode?: boolean
}

/**
 * Executes an existing workflow action handler so AI services can reuse real integrations.
 */
export async function runWorkflowAction(
  userId: string,
  actionType: string,
  config: Record<string, any>,
  input: Record<string, any> = {},
  options: RunActionOptions = {}
): Promise<ActionResult> {
  const workflowId = options.workflowId || "ai_assistant_runtime"
  const executionId = options.executionId || `ai-assistant-${Date.now()}`

  const node = {
    id: `ai_${actionType}_${Date.now()}`,
    data: {
      type: actionType,
      config,
      title: `AI ${actionType}`
    }
  }

  const executeAction = await getExecuteAction()

  return executeAction({
    node,
    input: {
      ...input,
      trigger: options.trigger,
      previousResults: options.previousResults || {},
      executionId,
      workflowId,
      testMode: options.testMode ?? false
    },
    userId,
    workflowId,
    testMode: options.testMode ?? false,
    executionMode: (options.testMode ?? false) ? "sandbox" : "live"
  })
}
