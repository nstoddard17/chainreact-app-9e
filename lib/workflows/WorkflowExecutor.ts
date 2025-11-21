import { TokenRefreshService } from "@/lib/integrations/tokenRefreshService"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { TokenAuditLogger } from "../integrations/TokenAuditLogger"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { executeAction } from "./executeNode"

import { logger } from '@/lib/utils/logger'

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

      // NEW: Build list of required integrations with integration_id support
      // Nodes can now specify a specific integration_id for multi-account support
      interface IntegrationRequirement {
        provider: string
        integrationId?: string  // If specified, use this specific account
        nodeId: string
      }

      const requiredIntegrations: IntegrationRequirement[] = workflow.nodes
        .filter((node: any) => node.data.providerId)
        .map((node: any) => ({
          provider: node.data.providerId,
          integrationId: node.data.config?.integration_id || node.data.integration_id,
          nodeId: node.id
        }))

      // Dedupe by integration_id if specified, otherwise by provider
      const uniqueIntegrations = new Map<string, IntegrationRequirement>()
      for (const req of requiredIntegrations) {
        const key = req.integrationId || `provider:${req.provider}`
        if (!uniqueIntegrations.has(key)) {
          uniqueIntegrations.set(key, req)
        }
      }

      const integrationResults = await Promise.all(
        Array.from(uniqueIntegrations.values()).map(async (req) => {
          let integration = null
          let error = null

          // If integration_id is specified, fetch by ID (multi-account)
          // Also validate user has access (owner or shared with them)
          if (req.integrationId) {
            const result = await supabase
              .from("integrations")
              .select("*")
              .eq("id", req.integrationId)
              .single()
            integration = result.data
            error = result.error

            // If found, verify user has access (owner or shared)
            if (integration && integration.user_id !== context.userId) {
              // Check if integration is shared with user
              const hasAccess = await this.checkIntegrationAccess(supabase, req.integrationId, context.userId)
              if (!hasAccess) {
                logger.warn(`[WorkflowExecutor] User ${context.userId} does not have access to integration ${req.integrationId}`)
                integration = null
                error = { message: "Access denied to shared integration" }
              }
            }
          } else {
            // Fallback: fetch by provider (backward compatibility - uses first account)
            // First try owned integrations
            const ownedResult = await supabase
              .from("integrations")
              .select("*")
              .eq("user_id", context.userId)
              .eq("provider", req.provider)
              .eq("status", "connected")
              .order("created_at", { ascending: true })
              .limit(1)
              .single()

            if (ownedResult.data) {
              integration = ownedResult.data
              error = null
            } else {
              // If no owned integration, try shared integrations
              const sharedResult = await this.getSharedIntegration(supabase, context.userId, req.provider)
              integration = sharedResult
              error = sharedResult ? null : { message: "No integration found" }
            }
          }

          if (error || !integration) {
            return { valid: false, requiresReauth: true, provider: req.provider, integrationId: req.integrationId }
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
              return { valid: true, requiresReauth: false, provider: req.provider, integrationId: req.integrationId }
            }
            return { valid: false, requiresReauth: true, provider: req.provider, integrationId: req.integrationId }
          }

          return { valid: true, requiresReauth: false, provider: req.provider, integrationId: req.integrationId }
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
      logger.error("Error executing workflow:", error)
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

      case "microsoft-outlook_trigger_new_email":
        // Filter by sender
        const outlookFromFilter = config?.from?.toLowerCase()
        if (outlookFromFilter && !input.from?.emailAddress?.address?.toLowerCase().includes(outlookFromFilter)) {
          return false
        }

        // Filter by subject
        const outlookSubjectFilter = config?.subject?.toLowerCase()
        if (outlookSubjectFilter && !input.subject?.toLowerCase().includes(outlookSubjectFilter)) {
          return false
        }

        // Filter by attachment presence
        if (config?.hasAttachment === "yes" && !input.hasAttachments) return false
        if (config?.hasAttachment === "no" && input.hasAttachments) return false

        // Filter by importance
        if (config?.importance && config?.importance !== "any" && input.importance?.toLowerCase() !== config?.importance?.toLowerCase()) {
          return false
        }

        // Filter by folder
        if (config?.folder && input.parentFolderId !== config?.folder) {
          return false
        }

        return true

      default:
        return true
    }
  }

  /**
   * Check if user has access to a shared integration
   * Returns true if user is owner, has direct share, team share, or org-wide access
   */
  private async checkIntegrationAccess(supabase: any, integrationId: string, userId: string): Promise<boolean> {
    try {
      // Check for direct share with user
      const { data: directShare } = await supabase
        .from("integration_shares")
        .select("id")
        .eq("integration_id", integrationId)
        .eq("shared_with_user_id", userId)
        .limit(1)
        .single()

      if (directShare) {
        return true
      }

      // Get user's team memberships
      const { data: teamMemberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)

      const teamIds = teamMemberships?.map((tm: any) => tm.team_id) || []

      // Check for team share
      if (teamIds.length > 0) {
        const { data: teamShare } = await supabase
          .from("integration_shares")
          .select("id")
          .eq("integration_id", integrationId)
          .in("shared_with_team_id", teamIds)
          .limit(1)
          .single()

        if (teamShare) {
          return true
        }
      }

      // Check for organization-wide sharing
      const { data: integration } = await supabase
        .from("integrations")
        .select("sharing_scope, user_id")
        .eq("id", integrationId)
        .single()

      if (integration?.sharing_scope === "organization" && teamIds.length > 0) {
        // User is in a team, check if they share org with integration owner
        const { data: sharedTeam } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", integration.user_id)
          .in("team_id", teamIds)
          .limit(1)
          .single()

        if (sharedTeam) {
          return true
        }
      }

      return false
    } catch (error: any) {
      logger.error("[WorkflowExecutor] Error checking integration access:", error)
      return false
    }
  }

  /**
   * Get a shared integration for a user by provider
   * Searches direct shares, team shares, and org-wide shares
   */
  private async getSharedIntegration(supabase: any, userId: string, provider: string): Promise<any> {
    try {
      // Get user's team memberships
      const { data: teamMemberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)

      const teamIds = teamMemberships?.map((tm: any) => tm.team_id) || []

      // Check for directly shared integrations
      const { data: directShares } = await supabase
        .from("integration_shares")
        .select("integration_id")
        .eq("shared_with_user_id", userId)

      const directShareIds = directShares?.map((s: any) => s.integration_id) || []

      // Check for team-shared integrations
      let teamShareIds: string[] = []
      if (teamIds.length > 0) {
        const { data: teamShares } = await supabase
          .from("integration_shares")
          .select("integration_id")
          .in("shared_with_team_id", teamIds)

        teamShareIds = teamShares?.map((s: any) => s.integration_id) || []
      }

      const sharedIds = [...new Set([...directShareIds, ...teamShareIds])]

      // First try to find a shared integration by ID
      if (sharedIds.length > 0) {
        const { data: sharedIntegration } = await supabase
          .from("integrations")
          .select("*")
          .in("id", sharedIds)
          .eq("provider", provider)
          .eq("status", "connected")
          .order("created_at", { ascending: true })
          .limit(1)
          .single()

        if (sharedIntegration) {
          return sharedIntegration
        }
      }

      // Check for organization-wide shared integrations
      if (teamIds.length > 0) {
        // Get users who share teams with current user
        const { data: teammates } = await supabase
          .from("team_members")
          .select("user_id")
          .in("team_id", teamIds)
          .neq("user_id", userId)

        const teammateIds = [...new Set(teammates?.map((t: any) => t.user_id) || [])]

        if (teammateIds.length > 0) {
          const { data: orgSharedIntegration } = await supabase
            .from("integrations")
            .select("*")
            .in("user_id", teammateIds)
            .eq("provider", provider)
            .eq("status", "connected")
            .eq("sharing_scope", "organization")
            .order("created_at", { ascending: true })
            .limit(1)
            .single()

          if (orgSharedIntegration) {
            return orgSharedIntegration
          }
        }
      }

      return null
    } catch (error: any) {
      logger.error("[WorkflowExecutor] Error getting shared integration:", error)
      return null
    }
  }
}
