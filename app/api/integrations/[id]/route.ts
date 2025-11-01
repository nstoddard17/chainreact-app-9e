import { type NextRequest } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/utils/logger'
import { canUserAdminIntegration, canUserUseIntegration, getIntegrationAdmins } from '@/lib/services/integration-permissions'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * DELETE /api/integrations/[id]
 *
 * Disconnects an integration. User must have 'admin' permission.
 *
 * Updated: 2025-10-28 - Added permission checks for workspace integrations
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: integrationId } = await params

    if (!integrationId) {
      return jsonResponse({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    // Get the current user
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Authorization header required" }, { status: 401 })
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "")

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ success: false, error: "Invalid authentication token" }, { status: 401 })
    }

    // Check if user has admin permission for this integration
    const hasPermission = await canUserAdminIntegration(user.id, integrationId)

    if (!hasPermission) {
      logger.warn(`❌ [DELETE /api/integrations/${integrationId}] Permission denied for user ${user.id}`)

      // Get list of admins to show in error message
      const admins = await getIntegrationAdmins(integrationId)

      return jsonResponse({
        success: false,
        error: "You don't have permission to disconnect this integration",
        admins: admins.map(admin => ({
          name: admin.full_name || admin.email,
          email: admin.email
        })),
        suggestion: admins.length > 0
          ? `Contact ${admins.map(a => a.full_name || a.email).join(', ')} to disconnect this integration`
          : "This is a team or organization integration. Contact your admin to disconnect it."
      }, { status: 403 })
    }

    // Get the integration details before deleting
    const { data: integration, error: fetchError } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single()

    if (fetchError || !integration) {
      return jsonResponse({ success: false, error: "Integration not found" }, { status: 404 })
    }

    // Delete the integration (cascade will delete permissions)
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("id", integrationId)

    if (deleteError) {
      logger.error("Error deleting integration:", deleteError)
      return jsonResponse({ success: false, error: "Failed to delete integration" }, { status: 500 })
    }

    logger.info(`✅ [DELETE /api/integrations/${integrationId}] Integration ${integration.provider} disconnected by user ${user.id}`)

    return jsonResponse({
      success: true,
      message: `${integration.provider} integration disconnected successfully`,
    })
  } catch (error) {
    logger.error("Error in DELETE /api/integrations/[id]:", error)
    return jsonResponse({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

/**
 * GET /api/integrations/[id]
 *
 * Gets a specific integration. User must have at least 'use' permission.
 *
 * Updated: 2025-10-28 - Added permission checks for workspace integrations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: integrationId } = await params

    if (!integrationId) {
      return jsonResponse({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    // Get the current user
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Authorization header required" }, { status: 401 })
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "")

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ success: false, error: "Invalid authentication token" }, { status: 401 })
    }

    // Check if user has permission to view this integration
    const hasPermission = await canUserUseIntegration(user.id, integrationId)

    if (!hasPermission) {
      logger.warn(`❌ [GET /api/integrations/${integrationId}] Permission denied for user ${user.id}`)
      return jsonResponse({ success: false, error: "Integration not found or access denied" }, { status: 404 })
    }

    // Get the integration with permission level
    const { data, error: fetchError } = await supabase
      .from("integrations")
      .select(`
        *,
        permissions:integration_permissions!inner(permission)
      `)
      .eq("id", integrationId)
      .eq("permissions.user_id", user.id)
      .single()

    if (fetchError || !data) {
      return jsonResponse({ success: false, error: "Integration not found" }, { status: 404 })
    }

    // Clean up response
    const { permissions, ...integration } = data as any

    return jsonResponse({
      success: true,
      data: {
        ...integration,
        user_permission: permissions?.permission || null
      },
    })
  } catch (error) {
    logger.error("Error in GET /api/integrations/[id]:", error)
    return jsonResponse({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
