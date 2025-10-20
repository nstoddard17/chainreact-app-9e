import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { logger } from '@/lib/utils/logger'

/**
 * Workflow Management Action Handler
 * Handles workflow operations: activate, deactivate, create, delete, list
 */
export class WorkflowManagementHandler extends BaseActionHandler {
  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Workflow Management Query", intent)

    try {
      const action = intent.action || "list_workflows"

      switch (action) {
        case "list_workflows":
          return this.handleListWorkflows(userId, supabaseAdmin, intent.parameters)
        case "get_workflow":
          return this.handleGetWorkflow(userId, supabaseAdmin, intent.parameters)
        case "workflow_status":
          return this.handleWorkflowStatus(userId, supabaseAdmin, intent.parameters)
        default:
          return this.getErrorResponse(`Workflow query "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Workflow management query error:", error)
      return this.getErrorResponse("Failed to retrieve workflow information.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Workflow Management Action", intent)

    try {
      const action = intent.action || "unknown"

      switch (action) {
        case "activate_workflow":
          return this.handleActivateWorkflow(userId, supabaseAdmin, intent.parameters)
        case "deactivate_workflow":
          return this.handleDeactivateWorkflow(userId, supabaseAdmin, intent.parameters)
        case "delete_workflow":
          return this.handleDeleteWorkflow(userId, supabaseAdmin, intent.parameters)
        case "create_workflow":
          return this.handleCreateWorkflow(userId, supabaseAdmin, intent.parameters)
        case "duplicate_workflow":
          return this.handleDuplicateWorkflow(userId, supabaseAdmin, intent.parameters)
        default:
          return this.getErrorResponse(`Workflow action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      logger.error("❌ Workflow management action error:", error)
      return this.getErrorResponse("Failed to perform workflow action.")
    }
  }

  private async handleListWorkflows(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const status = parameters?.status || parameters?.filter
    const limit = parameters?.limit || 20

    let query = supabaseAdmin
      .from('workflows')
      .select('id, name, description, status, trigger_type, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: workflows, error } = await query

    if (error) {
      logger.error("Error fetching workflows:", error)
      return this.getErrorResponse("Failed to fetch your workflows.")
    }

    if (!workflows || workflows.length === 0) {
      return {
        content: status
          ? `You don't have any ${status} workflows yet.`
          : "You don't have any workflows yet. Would you like to create one?",
        metadata: {
          type: "info",
          workflows: []
        }
      }
    }

    const workflowList = workflows.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      status: w.status,
      triggerType: w.trigger_type,
      updatedAt: w.updated_at
    }))

    return {
      content: `You have ${workflows.length} workflow${workflows.length !== 1 ? 's' : ''}.`,
      metadata: {
        type: "list",
        items: workflowList.map(w => ({
          id: w.id,
          title: w.name,
          description: w.description || `Trigger: ${w.triggerType}`,
          subtitle: `Status: ${w.status}`,
          badge: w.status,
          badgeVariant: w.status === 'active' ? 'default' : 'secondary',
          link: `/workflows/${w.id}`,
          metadata: [
            { label: 'Status', value: w.status },
            { label: 'Trigger', value: w.triggerType },
            { label: 'Updated', value: new Date(w.updatedAt).toLocaleDateString() }
          ]
        }))
      }
    }
  }

  private async handleGetWorkflow(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const workflowId = parameters?.workflowId || parameters?.id
    const workflowName = parameters?.name

    if (!workflowId && !workflowName) {
      return this.getErrorResponse("Please specify a workflow ID or name.")
    }

    let query = supabaseAdmin
      .from('workflows')
      .select('*')
      .eq('user_id', userId)

    if (workflowId) {
      query = query.eq('id', workflowId)
    } else if (workflowName) {
      query = query.ilike('name', `%${workflowName}%`)
    }

    const { data: workflows, error } = await query.limit(1).single()

    if (error || !workflows) {
      return this.getErrorResponse("Workflow not found.")
    }

    return {
      content: `Here's the workflow "${workflows.name}".`,
      metadata: {
        type: "json",
        tableName: workflows.name,
        data: {
          id: workflows.id,
          name: workflows.name,
          description: workflows.description,
          status: workflows.status,
          trigger_type: workflows.trigger_type,
          nodes: workflows.nodes,
          connections: workflows.connections,
          created_at: workflows.created_at,
          updated_at: workflows.updated_at
        }
      }
    }
  }

  private async handleWorkflowStatus(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const { data: counts, error } = await supabaseAdmin
      .from('workflows')
      .select('status')
      .eq('user_id', userId)

    if (error) {
      return this.getErrorResponse("Failed to get workflow status.")
    }

    const active = counts?.filter((w: any) => w.status === 'active').length || 0
    const inactive = counts?.filter((w: any) => w.status === 'inactive').length || 0
    const draft = counts?.filter((w: any) => w.status === 'draft').length || 0

    return {
      content: `You have ${active} active, ${inactive} inactive, and ${draft} draft workflows.`,
      metadata: {
        type: "metrics",
        metrics: [
          {
            label: "Active Workflows",
            value: active,
            icon: "activity",
            color: "success"
          },
          {
            label: "Inactive Workflows",
            value: inactive,
            icon: "clock",
            color: "default"
          },
          {
            label: "Draft Workflows",
            value: draft,
            icon: "file",
            color: "info"
          }
        ]
      }
    }
  }

  private async handleActivateWorkflow(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const workflowId = parameters?.workflowId || parameters?.id
    const workflowName = parameters?.name

    if (!workflowId && !workflowName) {
      return this.getErrorResponse("Please specify which workflow to activate.")
    }

    // Find workflow
    let query = supabaseAdmin
      .from('workflows')
      .select('id, name, status')
      .eq('user_id', userId)

    if (workflowId) {
      query = query.eq('id', workflowId)
    } else {
      query = query.ilike('name', `%${workflowName}%`)
    }

    const { data: workflow, error: fetchError } = await query.limit(1).single()

    if (fetchError || !workflow) {
      return this.getErrorResponse("Workflow not found.")
    }

    if (workflow.status === 'active') {
      return {
        content: `The workflow "${workflow.name}" is already active.`,
        metadata: { type: "info" }
      }
    }

    // Activate workflow
    const { error: updateError } = await supabaseAdmin
      .from('workflows')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', workflow.id)
      .eq('user_id', userId)

    if (updateError) {
      logger.error("Error activating workflow:", updateError)
      return this.getErrorResponse("Failed to activate the workflow.")
    }

    return {
      content: `Successfully activated the workflow "${workflow.name}". It will now run when triggered.`,
      metadata: {
        type: "confirmation",
        workflowId: workflow.id,
        workflowName: workflow.name,
        newStatus: 'active'
      }
    }
  }

  private async handleDeactivateWorkflow(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const workflowId = parameters?.workflowId || parameters?.id
    const workflowName = parameters?.name

    if (!workflowId && !workflowName) {
      return this.getErrorResponse("Please specify which workflow to deactivate.")
    }

    // Find workflow
    let query = supabaseAdmin
      .from('workflows')
      .select('id, name, status')
      .eq('user_id', userId)

    if (workflowId) {
      query = query.eq('id', workflowId)
    } else {
      query = query.ilike('name', `%${workflowName}%`)
    }

    const { data: workflow, error: fetchError } = await query.limit(1).single()

    if (fetchError || !workflow) {
      return this.getErrorResponse("Workflow not found.")
    }

    if (workflow.status === 'inactive') {
      return {
        content: `The workflow "${workflow.name}" is already inactive.`,
        metadata: { type: "info" }
      }
    }

    // Deactivate workflow
    const { error: updateError } = await supabaseAdmin
      .from('workflows')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', workflow.id)
      .eq('user_id', userId)

    if (updateError) {
      logger.error("Error deactivating workflow:", updateError)
      return this.getErrorResponse("Failed to deactivate the workflow.")
    }

    return {
      content: `Successfully deactivated the workflow "${workflow.name}". It will no longer run when triggered.`,
      metadata: {
        type: "confirmation",
        workflowId: workflow.id,
        workflowName: workflow.name,
        newStatus: 'inactive'
      }
    }
  }

  private async handleDeleteWorkflow(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const workflowId = parameters?.workflowId || parameters?.id

    if (!workflowId) {
      return this.getErrorResponse("Please specify which workflow to delete.")
    }

    // Get workflow first
    const { data: workflow, error: fetchError } = await supabaseAdmin
      .from('workflows')
      .select('id, name')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !workflow) {
      return this.getErrorResponse("Workflow not found.")
    }

    // Delete workflow
    const { error: deleteError } = await supabaseAdmin
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('user_id', userId)

    if (deleteError) {
      logger.error("Error deleting workflow:", deleteError)
      return this.getErrorResponse("Failed to delete the workflow.")
    }

    return {
      content: `Successfully deleted the workflow "${workflow.name}".`,
      metadata: {
        type: "confirmation",
        workflowId: workflow.id,
        workflowName: workflow.name,
        action: 'deleted'
      }
    }
  }

  private async handleCreateWorkflow(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    // For now, just guide the user to create manually
    return {
      content: "I can help guide you through creating a workflow! To create a new workflow, visit the [Workflows page](/workflows) and click the 'Create Workflow' button. You can choose from templates or build from scratch.",
      metadata: {
        type: "info",
        action: "create_workflow_guide",
        link: "/workflows"
      }
    }
  }

  private async handleDuplicateWorkflow(
    userId: string,
    supabaseAdmin: any,
    parameters: any
  ): Promise<ActionExecutionResult> {
    const workflowId = parameters?.workflowId || parameters?.id

    if (!workflowId) {
      return this.getErrorResponse("Please specify which workflow to duplicate.")
    }

    // Get original workflow
    const { data: original, error: fetchError } = await supabaseAdmin
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !original) {
      return this.getErrorResponse("Workflow not found.")
    }

    // Create duplicate
    const duplicate = {
      ...original,
      id: undefined,
      name: `${original.name} (Copy)`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: newWorkflow, error: createError } = await supabaseAdmin
      .from('workflows')
      .insert([duplicate])
      .select()
      .single()

    if (createError || !newWorkflow) {
      logger.error("Error duplicating workflow:", createError)
      return this.getErrorResponse("Failed to duplicate the workflow.")
    }

    return {
      content: `Successfully duplicated the workflow "${original.name}". The new workflow is named "${newWorkflow.name}" and is currently in draft status.`,
      metadata: {
        type: "confirmation",
        originalWorkflowId: workflowId,
        newWorkflowId: newWorkflow.id,
        newWorkflowName: newWorkflow.name,
        link: `/workflows/${newWorkflow.id}`
      }
    }
  }
}
