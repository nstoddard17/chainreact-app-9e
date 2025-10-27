import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: teamId, userId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check if current user is team admin/manager/owner
    const { data: currentUserMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!currentUserMember || !['owner', 'admin', 'manager'].includes(currentUserMember.role)) {
      return errorResponse("Only team owners, admins, and managers can remove members", 403)
    }

    // Check if target user is the owner
    const { data: targetMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .single()

    if (targetMember?.role === 'owner') {
      return errorResponse("Cannot remove team owner", 403)
    }

    // Remove the member
    const { error: deleteError } = await serviceClient
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId)

    if (deleteError) {
      logger.error("Error removing team member:", deleteError)
      return errorResponse("Failed to remove team member", 500)
    }

    return successResponse("Team member removed successfully")
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
