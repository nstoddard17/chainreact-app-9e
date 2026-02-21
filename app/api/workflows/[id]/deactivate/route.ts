import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * POST /api/workflows/[id]/deactivate
 *
 * Deactivates a workflow:
 * 1. Unregisters all webhooks
 * 2. Cleans up trigger resources (Microsoft Graph subscriptions, Gmail watches, etc.)
 * 3. Sets workflow status to 'inactive'
 *
 * This is a clean shutdown - the workflow returns to a pre-activation state.
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

    // Use service client to bypass RLS for lookup, then manually verify authorization
    // This fixes 404 errors when RLS policies don't include the user
    const serviceClient = await createSupabaseServiceClient()
    const { data: workflow, error: checkError } = await serviceClient
      .from("workflows")
      .select("id, user_id, status, name, workspace_id")
      .eq("id", resolvedParams.id)
      .single()

    if (checkError || !workflow) {
      logger.warn(`Workflow not found: ${resolvedParams.id}`, { error: checkError })
      return errorResponse("Workflow not found", 404)
    }

    // Check if user owns the workflow directly
    let hasAccess = workflow.user_id === user.id

    // Check workspace membership if not direct owner
    if (!hasAccess && workflow.workspace_id) {
      const { data: membership } = await serviceClient
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workflow.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle()

      if (membership) {
        // editor or higher can deactivate
        const roleHierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }
        hasAccess = (roleHierarchy[membership.role] ?? -1) >= 1
      }
    }

    if (!hasAccess) {
      return errorResponse("Not authorized to deactivate this workflow", 403)
    }

    // Only active workflows can be deactivated
    if (workflow.status !== 'active') {
      logger.warn(`Attempted to deactivate non-active workflow: ${workflow.id} (status: ${workflow.status})`)
      return errorResponse(`Workflow is not active (current status: ${workflow.status})`, 400)
    }

    logger.info(`🛑 Deactivating workflow: ${workflow.name} (${workflow.id})`)

    const errors: string[] = []

    // Step 1: Unregister legacy webhooks (if any)
    try {
      const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
      const webhookManager = new TriggerWebhookManager()
      await webhookManager.unregisterWorkflowWebhooks(workflow.id)
      logger.info('✅ Unregistered legacy webhooks')
    } catch (webhookError: any) {
      logger.error('❌ Failed to unregister legacy webhooks:', webhookError)
      errors.push(`Webhook cleanup: ${webhookError.message}`)
    }

    // Step 2: Deactivate trigger resources (Microsoft Graph, Gmail, etc.)
    try {
      const { triggerLifecycleManager } = await import('@/lib/triggers')
      await triggerLifecycleManager.deactivateWorkflowTriggers(workflow.id, user.id)
      logger.info('✅ Deactivated trigger resources')
    } catch (triggerError: any) {
      logger.error('❌ Failed to deactivate trigger resources:', triggerError)
      errors.push(`Trigger cleanup: ${triggerError.message}`)
    }

    // Step 3: Update workflow status to inactive (reuse serviceClient from above)
    const { data: updatedWorkflow, error: updateError } = await serviceClient
      .from("workflows")
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq("id", workflow.id)
      .select()
      .single()

    if (updateError) {
      logger.error('❌ Failed to update workflow status:', updateError)
      return errorResponse('Failed to update workflow status', 500)
    }

    logger.info(`✅ Workflow deactivated: ${workflow.name} (${workflow.id})`)

    // Return result with any non-fatal errors
    return jsonResponse({
      ...updatedWorkflow,
      deactivation: {
        success: true,
        errors: errors.length > 0 ? errors : undefined,
        message: errors.length > 0
          ? 'Workflow deactivated with some cleanup warnings'
          : 'Workflow deactivated successfully'
      }
    })

  } catch (error: any) {
    logger.error('❌ Unexpected error during deactivation:', error)
    return errorResponse(error.message || 'Failed to deactivate workflow', 500)
  }
}
