import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/integrations
 *
 * Fetches integrations for the current user based on workspace context.
 *
 * Query Parameters:
 * - workspace_type: 'personal' | 'team' | 'organization' (default: 'personal')
 * - workspace_id: UUID of team or organization (required for team/org)
 *
 * Returns integrations that the user has permission to access.
 *
 * Updated: 2025-10-28 - Added workspace context filtering
 */
export async function GET(request: NextRequest) {
  logger.debug('📍 [API /api/integrations] GET request received', {
    timestamp: new Date().toISOString(),
    url: request.url
  });

  try {
    // Get authenticated user
    const supabaseAuth = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()

    if (userError || !user) {
      logger.error('❌ [API /api/integrations] Auth error', {
        userError,
        hasUser: !!user
      });
      return errorResponse("Not authenticated", 401)
    }

    logger.debug('✅ [API /api/integrations] User authenticated', { userId: user.id });

    // Parse workspace context from query parameters
    const { searchParams } = new URL(request.url)
    const workspaceType = searchParams.get('workspace_type') || 'personal'
    const workspaceId = searchParams.get('workspace_id')

    logger.debug('🏠 [API /api/integrations] Workspace context', {
      workspaceType,
      workspaceId
    });

    // Validate workspace parameters
    if ((workspaceType === 'team' || workspaceType === 'organization') && !workspaceId) {
      return errorResponse('workspace_id is required for team/organization context', 400)
    }

    if (!['personal', 'team', 'organization'].includes(workspaceType)) {
      return errorResponse('Invalid workspace_type. Must be personal, team, or organization', 400)
    }

    // Use service role client to query integrations with permissions
    const supabaseService = await createSupabaseServiceClient()

    let query = supabaseService
      .from("integrations")
      .select(`
        *,
        permissions:integration_permissions(permission, user_id)
      `)

    // Filter by workspace context
    if (workspaceType === 'personal') {
      query = query
        .eq('workspace_type', 'personal')
        .eq('user_id', user.id)
    } else if (workspaceType === 'team') {
      query = query
        .eq('workspace_type', 'team')
        .eq('workspace_id', workspaceId)
    } else if (workspaceType === 'organization') {
      query = query
        .eq('workspace_type', 'organization')
        .eq('workspace_id', workspaceId)
    }

    const { data: integrations, error: integrationsError } = await query

    logger.debug('📊 [API /api/integrations] Query result', {
      workspaceType,
      workspaceId,
      count: integrations?.length || 0,
      error: integrationsError
    });

    if (integrationsError) {
      logger.error('❌ [API /api/integrations] Database error:', {
        message: integrationsError.message,
        code: integrationsError.code,
        details: integrationsError.details,
        hint: integrationsError.hint
      });
      return errorResponse(integrationsError.message, 500)
    }

    // Check for expired integrations and update their status
    const now = new Date()
    const expiredIntegrationIds: string[] = []

    // First, identify all expired integrations
    for (const integration of integrations || []) {
      if (
        integration.status === "connected" &&
        integration.expires_at &&
        new Date(integration.expires_at) <= now
      ) {
        expiredIntegrationIds.push(integration.id)
      }
    }

    // Batch update all expired integrations at once
    if (expiredIntegrationIds.length > 0) {
      await supabaseService
        .from("integrations")
        .update({
          status: "expired",
          updated_at: now.toISOString(),
        })
        .in("id", expiredIntegrationIds)

      logger.debug(`⏰ [API /api/integrations] Updated ${expiredIntegrationIds.length} expired integrations`)
    }

    // Update the integrations array with the corrected statuses
    // Also clean up the permissions object and add permission level to root
    const updatedIntegrations = integrations?.map((integration: any) => {
      const { permissions, ...integrationData } = integration

      // permissions is now an array from the LEFT JOIN
      // Find the permission for the current user
      const userPermission = Array.isArray(permissions)
        ? permissions.find((p: any) => p.user_id === user.id)?.permission
        : permissions?.permission

      return {
        ...integrationData,
        status: expiredIntegrationIds.includes(integration.id) ? "expired" : integration.status,
        user_permission: userPermission || null // Add permission level to response
      }
    })

    logger.debug('✅ [API /api/integrations] Returning integrations', {
      count: updatedIntegrations?.length || 0,
      workspaceType
    });

    return jsonResponse({
      success: true,
      data: updatedIntegrations || [],
      workspace: {
        type: workspaceType,
        id: workspaceId
      }
    })
  } catch (error: any) {
    logger.error('❌ [API /api/integrations] Exception:', error);
    return jsonResponse(
      {
        success: false,
        error: error.message || "Failed to fetch integrations",
      },
      { status: 500 }
    )
  }
}
