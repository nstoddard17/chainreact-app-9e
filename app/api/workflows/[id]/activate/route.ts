import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * POST /api/workflows/[id]/activate
 *
 * Activates a workflow:
 * 1. Validates workflow has required configuration
 * 2. Checks graph connectivity (trigger → action)
 * 3. Creates trigger resources (Microsoft Graph subscriptions, Gmail watches, etc.)
 * 4. Registers webhooks
 * 5. Sets workflow status to 'active'
 *
 * If activation fails, workflow status is rolled back.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const resolvedParams = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(resolvedParams.id)) {
      return errorResponse("Invalid workflow ID format", 400)
    }

    // Use service client to fetch full workflow data
    const serviceClient = await createSupabaseServiceClient()

    const { data: workflow, error: fetchError } = await serviceClient
      .from("workflows")
      .select("id, name, user_id, status")
      .eq("id", resolvedParams.id)
      .single()

    if (fetchError || !workflow) {
      return errorResponse("Workflow not found", 404)
    }

    if (workflow.user_id !== user.id) {
      return errorResponse("Not authorized to activate this workflow", 403)
    }

    // Can only activate workflows that are draft or inactive
    if (workflow.status === 'active') {
      logger.warn(`Workflow already active: ${workflow.id}`)
      return jsonResponse(workflow)
    }

    logger.info(`🚀 Activating workflow: ${workflow.name} (${workflow.id})`)

    // Load nodes from normalized table for validation
    const { data: nodesData, error: nodesError } = await serviceClient
      .from('workflow_nodes')
      .select('id, node_type, is_trigger, config, provider_id')
      .eq('workflow_id', resolvedParams.id)

    if (nodesError) {
      logger.error('❌ Failed to load workflow nodes:', nodesError)
      return errorResponse('Failed to load workflow nodes', 500)
    }

    // Simple validation: workflow needs at least 1 trigger (is_trigger=true) and at least 1 action (is_trigger=false)
    // Both are already filtered by workflow_id in the query above
    const triggerCount = (nodesData || []).filter((n: any) => n.is_trigger === true).length
    const actionCount = (nodesData || []).filter((n: any) => n.is_trigger === false).length

    if (triggerCount === 0) {
      return errorResponse('Workflow must have at least one trigger', 400)
    }

    if (actionCount === 0) {
      return errorResponse('Workflow must have at least one action', 400)
    }

    // Validate node configurations against their schemas
    const { ALL_NODE_COMPONENTS } = await import('@/lib/workflows/nodes')
    const { getMissingRequiredFields } = await import('@/lib/workflows/validation/fieldVisibility')

    const configurationErrors: string[] = []
    for (const node of (nodesData || [])) {
      const nodeType = (node as any).node_type
      if (!nodeType || nodeType === 'ai_agent') continue

      const component = ALL_NODE_COMPONENTS.find((c: any) => c.type === nodeType)
      if (!component?.configSchema?.length) continue

      const nodeInfo = {
        type: nodeType,
        providerId: (node as any).provider_id,
        configSchema: component.configSchema
      }

      const values = (node as any).config || {}
      const missing = getMissingRequiredFields(nodeInfo, values)

      if (missing.length > 0) {
        const nodeTitle = component.title || nodeType
        configurationErrors.push(
          `${nodeTitle} is missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
        )
      }
    }

    if (configurationErrors.length > 0) {
      logger.warn('❌ Workflow has unconfigured nodes:', configurationErrors)
      return errorResponse(
        `Workflow has unconfigured nodes: ${configurationErrors.join('; ')}`,
        400
      )
    }

    // Validate data-flow: ensure all {{...}} variable references resolve to real nodes
    const { data: edgesData } = await serviceClient
      .from('workflow_edges')
      .select('source_node_id, target_node_id')
      .eq('workflow_id', resolvedParams.id)

    const { validateDataFlow } = await import('@/lib/workflows/validation/validateDataFlow')
    const dataFlowNodes = (nodesData || []).map((n: any) => ({
      id: n.id,
      data: {
        type: n.node_type,
        title: n.node_type,
        isTrigger: n.is_trigger,
        config: n.config || {},
      }
    }))
    const dataFlowEdges = (edgesData || []).map((e: any) => ({
      source: e.source_node_id,
      target: e.target_node_id,
    }))
    const dataFlowResult = validateDataFlow(dataFlowNodes, dataFlowEdges)

    if (!dataFlowResult.isValid) {
      const refErrors = dataFlowResult.unresolvedReferences.map(
        (r) => `${r.nodeTitle}: ${r.reference} — ${r.reason}`
      )
      logger.warn('❌ Workflow has unresolved variable references:', refErrors)
      return errorResponse(
        `Workflow has unresolved variable references: ${refErrors.join('; ')}`,
        400
      )
    }

    // Convert nodes to format expected by TriggerLifecycleManager
    const nodes = (nodesData || []).map((n: any) => ({
      id: n.id,
      data: {
        type: n.node_type,
        isTrigger: n.is_trigger,
        config: n.config || {},
        providerId: n.provider_id
      }
    }))

    // Step 1: Update status to active (optimistic)
    const { data: activatedWorkflow, error: updateError } = await serviceClient
      .from("workflows")
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq("id", workflow.id)
      .select()
      .single()

    if (updateError) {
      logger.error('❌ Failed to update workflow status:', updateError)
      return errorResponse('Failed to update workflow status', 500)
    }

    // Step 2: Activate trigger resources (Microsoft Graph, Gmail, etc.)
    try {
      const { triggerLifecycleManager } = await import('@/lib/triggers')
      const result = await triggerLifecycleManager.activateWorkflowTriggers(
        workflow.id,
        user.id,
        nodes
      )

      if (result.errors.length > 0) {
        logger.error('❌ Trigger activation failed:', result.errors)

        // Rollback workflow status
        const { data: rolledBackWorkflow } = await serviceClient
          .from('workflows')
          .update({
            status: workflow.status, // Restore previous status
            updated_at: new Date().toISOString()
          })
          .eq('id', workflow.id)
          .select()
          .single()

        return errorResponse(
          'Failed to activate workflow triggers',
          500,
          {
            errors: result.errors,
            workflow: rolledBackWorkflow
          }
        )
      }

      logger.info('✅ All trigger resources activated successfully')

      // Save activation snapshot for diff-on-edit feature
      try {
        const { createWorkflowSnapshot } = await import('@/lib/workflows/validation/workflowDiff')
        const snapshot = createWorkflowSnapshot(
          dataFlowNodes,
          dataFlowEdges
        )
        await serviceClient
          .from('workflow_activation_snapshots')
          .insert({
            workflow_id: workflow.id,
            snapshot_json: snapshot,
            activated_at: new Date().toISOString(),
            created_by: user.id,
          })
      } catch (snapshotError) {
        // Non-critical — don't fail activation if snapshot save fails
        logger.warn('Failed to save activation snapshot:', snapshotError)
      }

      logger.info(`✅ Workflow activated: ${workflow.name} (${workflow.id})`)

      // Agent eval: server-side activation success event (redundancy for client-side tracking)
      const sessionId = request.headers.get('X-Agent-Session-Id')
      const conversationId = request.headers.get('X-Agent-Conversation-Id')
      if (sessionId && conversationId) {
        try {
          await serviceClient.from('agent_eval_events' as any).insert({
            event_name: 'agent.activation_succeeded',
            category: 'funnel',
            session_id: sessionId,
            conversation_id: conversationId,
            user_id: user.id,
            flow_id: workflow.id,
            metadata: { server_side: true, trigger_count: triggerCount, action_count: actionCount },
          })
        } catch { /* best effort */ }
      }

      return jsonResponse({
        ...activatedWorkflow,
        activation: {
          success: true,
          message: 'Workflow activated successfully'
        }
      })
    } catch (triggerError: any) {
      logger.error('❌ Failed to activate triggers:', triggerError)

      // Rollback workflow status
      const { data: rolledBackWorkflow } = await serviceClient
        .from('workflows')
        .update({
          status: workflow.status, // Restore previous status
          updated_at: new Date().toISOString()
        })
        .eq('id', workflow.id)
        .select()
        .single()

      return errorResponse(
        triggerError.message || 'Failed to activate workflow triggers',
        500,
        { workflow: rolledBackWorkflow }
      )
    }

  } catch (error: any) {
    logger.error('❌ Unexpected error during activation:', error)
    return errorResponse(error.message || 'Failed to activate workflow', 500)
  }
}
