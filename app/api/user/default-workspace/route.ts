import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

/**
 * GET /api/user/default-workspace
 * Fetch user's default workspace preference
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('default_workspace_type, default_workspace_id')
      .eq('id', user.id)
      .single()

    if (error) {
      logger.error('[API /api/user/default-workspace] Error fetching default workspace:', error)
      return errorResponse(error.message, 500)
    }

    return successResponse({
      default_workspace_type: profile?.default_workspace_type || null,
      default_workspace_id: profile?.default_workspace_id || null
    })
  } catch (error: any) {
    logger.error('[API /api/user/default-workspace] Exception:', error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * PUT /api/user/default-workspace
 * Update user's default workspace preference
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { workspace_type, workspace_id } = body

    // Validate workspace_type
    if (workspace_type && !['personal', 'team', 'organization'].includes(workspace_type)) {
      return errorResponse("Invalid workspace_type", 400)
    }

    // If workspace_type is personal, workspace_id should be null
    const effectiveWorkspaceId = workspace_type === 'personal' ? null : workspace_id

    // Update user profile
    const { error } = await supabase
      .from('user_profiles')
      .update({
        default_workspace_type: workspace_type || null,
        default_workspace_id: effectiveWorkspaceId
      })
      .eq('id', user.id)

    if (error) {
      logger.error('[API /api/user/default-workspace] Error updating default workspace:', error)
      return errorResponse(error.message, 500)
    }

    logger.info('[API /api/user/default-workspace] Updated default workspace', {
      userId: user.id,
      workspace_type,
      workspace_id: effectiveWorkspaceId
    })

    return successResponse({
      message: "Default workspace updated successfully",
      default_workspace_type: workspace_type || null,
      default_workspace_id: effectiveWorkspaceId
    })
  } catch (error: any) {
    logger.error('[API /api/user/default-workspace] Exception:', error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * DELETE /api/user/default-workspace
 * Clear user's default workspace preference (revert to no default)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Clear default workspace
    const { error } = await supabase
      .from('user_profiles')
      .update({
        default_workspace_type: null,
        default_workspace_id: null
      })
      .eq('id', user.id)

    if (error) {
      logger.error('[API /api/user/default-workspace] Error clearing default workspace:', error)
      return errorResponse(error.message, 500)
    }

    logger.info('[API /api/user/default-workspace] Cleared default workspace', {
      userId: user.id
    })

    return successResponse({
      message: "Default workspace cleared successfully"
    })
  } catch (error: any) {
    logger.error('[API /api/user/default-workspace] Exception:', error)
    return errorResponse("Internal server error", 500)
  }
}
