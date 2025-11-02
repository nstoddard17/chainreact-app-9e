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

    const isSelfRemoval = user.id === userId

    // Get current user's membership
    const { data: currentUserMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!currentUserMember) {
      return errorResponse("You are not a member of this team", 403)
    }

    // Get target user's membership
    const { data: targetMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .single()

    if (!targetMember) {
      return errorResponse("User is not a member of this team", 404)
    }

    // Check permissions
    if (isSelfRemoval) {
      // User is leaving voluntarily
      // Check if they're the owner
      if (targetMember.role === 'owner') {
        // Count other members
        const { count: memberCount } = await serviceClient
          .from("team_members")
          .select("id", { count: 'exact', head: true })
          .eq("team_id", teamId)

        if (memberCount && memberCount > 1) {
          return errorResponse("Team owners must transfer ownership before leaving. There are other members in the team.", 403)
        }
        // If they're the only member (count === 1), allow leaving
        // This will trigger auto-deletion of the team via database trigger
      }
      // Non-owners can leave freely
    } else {
      // Admin removing another member
      if (!['owner', 'admin', 'manager'].includes(currentUserMember.role)) {
        return errorResponse("Only team owners, admins, and managers can remove members", 403)
      }

      // Cannot remove the owner
      if (targetMember.role === 'owner') {
        return errorResponse("Cannot remove team owner. They must transfer ownership first.", 403)
      }
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

    const message = isSelfRemoval ? "You have left the team" : "Team member removed successfully"
    return successResponse(message)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
