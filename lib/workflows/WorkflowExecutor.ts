import { getValidAccessToken } from "@/lib/integrations/getValidAccessToken"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { TokenAuditLogger } from "../integrations/TokenAuditLogger"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"

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
    try {
      const logger = new TokenAuditLogger()

      const supabase = getAdminSupabaseClient()

      // Step 1: Fetch workflow definition to get the trigger node
      const { data: workflow, error: workflowError } = await supabase
        .from("workflows")
        .select("*, nodes:workflow_nodes(*)")
        .eq("id", context.workflowId)
        .single()

      if (workflowError || !workflow) {
        throw new Error(`Workflow with id ${context.workflowId} not found.`)
      }

      const triggerNode = workflow.nodes.find(node => node.data.isTrigger)

      // Step 2: Evaluate trigger conditions
      const triggerConditionsMet = await this.evaluateTrigger(triggerNode, context.input)
      if (!triggerConditionsMet) {
        return {
          success: true, // Not an error, just not triggered
          message: "Trigger conditions not met",
          pausedForReauth: false,
        }
      }

      // Log the start of the execution
      // Validate all required integrations first
      const integrationResults = await Promise.all(
        context.integrations.map((provider) => getValidAccessToken(context.userId, provider)),
      )

      // Check if any integrations require reauth
      const missingIntegrations = integrationResults
        .filter((result) => !result.valid && result.requiresReauth)
        .map((result) => result.provider)

      if (missingIntegrations.length > 0) {
        // Create a workflow execution record with paused status
        await this.createExecutionRecord(context.workflowId, "paused", {
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

      // All integrations are valid, create execution record
      const executionId = await this.createExecutionRecord(context.workflowId, "running", {
        input: context.input,
      })

      // Execute the workflow (this would be your actual workflow execution logic)
      // For now, we'll just simulate a successful execution
      const result = {
        success: true,
        message: "Workflow executed successfully",
        pausedForReauth: false,
        output: { executionId, ...context.input },
      }

      // Update execution record with success
      await this.updateExecutionRecord(executionId, "completed", {
        output: result.output,
      })

      return result
    } catch (error: any) {
      console.error("Error executing workflow:", error)

      return {
        success: false,
        message: `Workflow execution failed: ${error.message}`,
        pausedForReauth: false,
        error,
      }
    }
  }

  /**
   * Creates a workflow execution record
   */
  private async createExecutionRecord(
    workflowId: string,
    status: "pending" | "running" | "completed" | "failed" | "paused",
    data?: Record<string, any>,
  ): Promise<string> {
    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      throw new Error("Failed to create database client")
    }

    const { data: execution, error } = await supabase
      .from("workflow_executions")
      .insert({
        workflow_id: workflowId,
        status,
        execution_data: data || {},
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create execution record: ${error.message}`)
    }

    return execution.id
  }

  /**
   * Updates a workflow execution record
   */
  private async updateExecutionRecord(
    executionId: string,
    status: "pending" | "running" | "completed" | "failed" | "paused",
    data?: Record<string, any>,
  ): Promise<void> {
    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      throw new Error("Failed to create database client")
    }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === "completed" || status === "failed") {
      updateData.completed_at = new Date().toISOString()
    }

    if (data) {
      updateData.execution_data = data
    }

    const { error } = await supabase.from("workflow_executions").update(updateData).eq("id", executionId)

    if (error) {
      throw new Error(`Failed to update execution record: ${error.message}`)
    }
  }

  private async getIntegration(integrationId: string): Promise<any> {
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from("integrations")
      .select()
      .eq("id", integrationId)
      .single()

    if (error) {
      throw new Error(`Failed to get integration: ${error.message}`)
    }

    return data
  }

  private async updateStepExecution(
    stepExecutionId: string,
    updates: Record<string, any>,
  ): Promise<void> {
    const supabase = getAdminSupabaseClient()
    await supabase.from("step_executions").update(updates).eq("id", stepExecutionId)
  }

  private async getDecryptedAccessToken(integration: any): Promise<string> {
    if (integration.access_token) {
      try {
        const supabase = getAdminSupabaseClient()
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
      // If no input or trigger, assume it's a manual trigger or not event-based
      return true
    }

    const { type, config } = triggerNode.data

    switch (type) {
      case "gmail_trigger_new_email":
        const fromFilter = config?.from?.toLowerCase()
        const subjectFilter = config?.subject?.toLowerCase()

        if (fromFilter && !input.from?.toLowerCase().includes(fromFilter)) {
          return false
        }
        if (subjectFilter && !input.subject?.toLowerCase().includes(subjectFilter)) {
          return false
        }
        if (config?.hasAttachment === "yes" && !input.hasAttachment) {
          return false
        }
        if (config?.hasAttachment === "no" && input.hasAttachment) {
          return false
        }
        return true

      case "gmail_trigger_new_attachment":
        if (!input.hasAttachment) {
          // This trigger requires an attachment
          return false
        }
        const fromFilterAttach = config?.from?.toLowerCase()
        const attachmentNameFilter = config?.attachmentName?.toLowerCase()

        if (fromFilterAttach && !input.from?.toLowerCase().includes(fromFilterAttach)) {
          return false
        }
        if (attachmentNameFilter && !input.attachmentName?.toLowerCase().includes(attachmentNameFilter)) {
          return false
        }
        return true

      // Add other trigger cases here
      // e.g., case "slack_trigger_new_message":

      default:
        // By default, if no specific trigger logic, allow execution
        return true
    }
  }
}
