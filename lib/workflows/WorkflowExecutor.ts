import { LegacyTokenRefreshService as TokenRefreshService } from "@/src/infrastructure/workflows/legacy-compatibility"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { TokenAuditLogger } from "../integrations/TokenAuditLogger"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { executeAction } from "./executeNode"

interface WorkflowContext {
  workflowId: string
  userId: string
  integrations: string[]
  input?: Record<string, any>
  triggerNode?: any
}

interface WorkflowResult {
  success: boolean
  message: string
  pausedForReauth: boolean
  missingIntegrations?: string[]
  output?: Record<string, any>
  error?: any
}

export class WorkflowExecutor {
  /**
   * Executes a workflow with the given context
   * Automatically handles token refresh and pauses for reauth if needed
   */
  async executeWorkflow(context: WorkflowContext): Promise<WorkflowResult> {
    let executionId
    try {
      const logger = new TokenAuditLogger()
      const supabase = await createSupabaseServerClient()

      const { data: workflow, error: workflowError } = await supabase
        .from("workflows")
        .select("*, nodes:workflow_nodes(*), edges:workflow_edges(*)")
        .eq("id", context.workflowId)
        .single()

      if (workflowError || !workflow) {
        throw new Error(`Workflow with id ${context.workflowId} not found.`)
      }

      const triggerNode = workflow.nodes.find((node: any) => node.data.isTrigger)

      const triggerConditionsMet = await this.evaluateTrigger(triggerNode, context.input)
      if (!triggerConditionsMet) {
        return {
          success: true,
          message: "Trigger conditions not met",
          pausedForReauth: false,
        }
      }

      const requiredIntegrations: string[] = workflow.nodes
        .map((node: any) => node.data.providerId)
        .filter((providerId: any): providerId is string => !!providerId)

      const integrationResults = await Promise.all(
        [...new Set(requiredIntegrations)].map(async (provider: string) => {
          const { data: integration, error } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", context.userId)
            .eq("provider", provider)
            .single()

          if (error || !integration) {
            return { valid: false, requiresReauth: true, provider }
          }

          // Check if token needs refresh
          const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
            accessTokenExpiryThreshold: 5
          })

          if (shouldRefresh.shouldRefresh && integration.refresh_token) {
            const refreshResult = await TokenRefreshService.refreshTokenForProvider(
              integration.provider,
              integration.refresh_token,
              integration
            )

            if (refreshResult.success) {
              return { valid: true, requiresReauth: false, provider }
            } else {
              return { valid: false, requiresReauth: true, provider }
            }
          }

          return { valid: true, requiresReauth: false, provider }
        })
      )

      const missingIntegrations = integrationResults
        .filter((result: any) => !result.valid && result.requiresReauth)
        .map((result: any) => result.provider)

      if (missingIntegrations.length > 0) {
        // This execution ID is for a paused workflow
        const pausedExecutionId = await this.createExecutionRecord(context.workflowId, "paused", {
          reason: "missing_integrations",
          missingIntegrations,
          input: context.input,
        })
        return {
          success: false,
          message: "Workflow paused due to missing integrations",
          pausedForReauth: true,
          missingIntegrations,
        }
      }

      executionId = await this.createExecutionRecord(context.workflowId, "running", {
        input: context.input || {},
      })

      const result = await this.traverseAndExecute(workflow, executionId, context)

      await this.updateExecutionRecord(executionId, "completed", {
        output: result.output,
      })

      return result
    } catch (error: any) {
      console.error("Error executing workflow:", error)
      if (executionId) {
        await this.updateExecutionRecord(executionId, "failed", {
          error: error.message,
        })
      }
      return {
        success: false,
        message: `Workflow execution failed: ${error.message}`,
        pausedForReauth: false,
        error,
      }
    }
  }

  private async createExecutionRecord(
    workflowId: string,
    status: "pending" | "running" | "completed" | "failed" | "paused",
    data?: Record<string, any>
  ): Promise<string> {
    const supabase = await createSupabaseServerClient()
    const { data: execution, error } = await supabase
      .from("workflow_executions")
      .insert({
        workflow_id: workflowId,
        status,
        execution_data: data ?? {},
        started_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) throw new Error(`Failed to create execution record: ${error.message}`)
    return execution.id
  }

  private async updateExecutionRecord(
    executionId: string,
    status: "pending" | "running" | "completed" | "failed" | "paused",
    data?: Record<string, any>
  ): Promise<void> {
    const supabase = await createSupabaseServerClient()
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === "completed" || status === "failed") {
      updateData.completed_at = new Date().toISOString()
    }
    if (data) {
      updateData.execution_data = data ?? {}
    }
    const { error } = await supabase.from("workflow_executions").update(updateData).eq("id", executionId)
    if (error) throw new Error(`Failed to update execution record: ${error.message}`)
  }

  private async traverseAndExecute(
    workflow: any,
    executionId: string,
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    const triggerNode = workflow.nodes.find((node: any) => node.data.isTrigger)
    if (!triggerNode) throw new Error("No trigger node found in the workflow.")

    const edges = workflow.edges || []
    let currentNodeId = edges.find((edge: any) => edge.source === triggerNode.id)?.target
    let currentInput = context.input || {}
    const outputs = []

    while (currentNodeId) {
      const currentNode = workflow.nodes.find((node: any) => node.id === currentNodeId)
      if (!currentNode) {
        throw new Error(`Node with ID ${currentNodeId} not found.`)
      }

      try {
        const result = await executeAction({
          node: currentNode,
          input: currentInput,
          userId: context.userId,
          workflowId: context.workflowId,
        })

        if (!result.success) {
          throw new Error(result.message)
        }

        currentInput = result.output
        outputs.push(result.output)

        const nextEdge = edges.find((edge: any) => edge.source === currentNodeId)
        currentNodeId = nextEdge ? nextEdge.target : null
      } catch (error: any) {
        throw error
      }
    }

    return {
      success: true,
      message: "Workflow executed successfully",
      pausedForReauth: false,
      output: { executionId, finalOutput: currentInput, allOutputs: outputs },
    }
  }

  private async getIntegration(integrationId: string): Promise<any> {
    if (!integrationId) throw new Error("integrationId is required")
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.from("integrations").select().eq("id", integrationId).single()
    if (error) throw new Error(`Failed to get integration: ${error.message}`)
    return data
  }

  private async updateStepExecution(stepExecutionId: string, updates: Record<string, any>): Promise<void> {
    const supabase = await createSupabaseServerClient()
    await supabase.from("step_executions").update(updates).eq("id", stepExecutionId)
  }

  private async getDecryptedAccessToken(integration: any): Promise<string> {
    if (integration.access_token) {
      try {
        const secret = await getSecret("encryption_key")
        return await decrypt(integration.access_token, secret)
      } catch (error: any) {
        throw new Error(`Failed to decrypt access token: ${error.message}`)
      }
    }
    throw new Error("Access token not found in integration")
  }

  private async evaluateTrigger(triggerNode: any, input?: Record<string, any>): Promise<boolean> {
    if (!triggerNode || !input) {
      return true
    }

    const { type, config } = triggerNode.data
    switch (type) {
      case "gmail_trigger_new_email":
        const fromFilter = config?.from?.toLowerCase()
        const subjectFilter = config?.subject?.toLowerCase()
        if (fromFilter && !input.from?.toLowerCase().includes(fromFilter)) return false
        if (subjectFilter && !input.subject?.toLowerCase().includes(subjectFilter)) return false
        if (config?.hasAttachment === "yes" && !input.hasAttachment) return false
        if (config?.hasAttachment === "no" && input.hasAttachment) return false
        return true
      case "gmail_trigger_new_attachment":
        if (!input.hasAttachment) return false
        const fromFilterAttach = config?.from?.toLowerCase()
        const attachmentNameFilter = config?.attachmentName?.toLowerCase()
        if (fromFilterAttach && !input.from?.toLowerCase().includes(fromFilterAttach)) return false
        if (attachmentNameFilter && !input.attachmentName?.toLowerCase().includes(attachmentNameFilter)) return false
        return true
      default:
        return true
    }
  }
}
