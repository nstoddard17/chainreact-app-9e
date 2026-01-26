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

      logger.debug('✅ All trigger resources activated successfully')
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

    logger.info(`✅ Workflow activated: ${workflow.name} (${workflow.id})`)

    return jsonResponse({
      ...activatedWorkflow,
      activation: {
        success: true,
        message: 'Workflow activated successfully'
      }
    })

  } catch (error: any) {
    logger.error('❌ Unexpected error during activation:', error)
    return errorResponse(error.message || 'Failed to activate workflow', 500)
  }
}
