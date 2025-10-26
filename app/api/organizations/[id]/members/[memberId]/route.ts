import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

// Note: This route is DEPRECATED
// Members should now be managed via /api/teams/[id]/members endpoints
// Keeping this for backward compatibility but it will update ALL teams the user is in

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: organizationId, memberId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { role, team_id } = body

    if (!role || !['admin', 'member', 'viewer'].includes(role)) {
      return errorResponse("Invalid role", 400)
    }

    // Check if user is admin of any team in the organization
    const { data: adminTeams } = await serviceClient
      .from("teams")
      .select(`
        id,
        team_members!inner(role)
      `)
      .eq("organization_id", organizationId)
      .eq("team_members.user_id", user.id)
      .eq("team_members.role", "admin")

    if (!adminTeams || adminTeams.length === 0) {
      return errorResponse("Insufficient permissions - only team admins can update member roles", 403)
    }

    // If team_id specified, update only that team membership
    if (team_id) {
      const { data: updatedMember, error: updateError } = await serviceClient
        .from("team_members")
        .update({ role })
        .eq("team_id", team_id)
        .eq("user_id", memberId)
        .select(`
          *,
          user:users(id, email, username)
        `)
        .single()

      if (updateError) {
        logger.error("Error updating team member:", updateError)
        return errorResponse("Failed to update member", 500)
      }

      return jsonResponse(updatedMember)
    }

    // Otherwise update ALL team memberships in this organization
    const { data: teams } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", organizationId)

    if (!teams || teams.length === 0) {
      return errorResponse("No teams found in organization", 404)
    }

    const teamIds = teams.map(t => t.id)

    const { data: updatedMembers, error: updateError } = await serviceClient
      .from("team_members")
      .update({ role })
      .in("team_id", teamIds)
      .eq("user_id", memberId)
      .select(`
        *,
        user:users(id, email, username),
        team:teams(id, name)
      `)

    if (updateError) {
      logger.error("Error updating team members:", updateError)
      return errorResponse("Failed to update member", 500)
    }

    return jsonResponse({
      success: true,
      updated_count: updatedMembers?.length || 0,
      members: updatedMembers
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: organizationId, memberId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check if user is admin of any team in the organization
    const { data: adminTeams } = await serviceClient
      .from("teams")
      .select(`
        id,
        team_members!inner(role)
      `)
      .eq("organization_id", organizationId)
      .eq("team_members.user_id", user.id)
      .eq("team_members.role", "admin")

    if (!adminTeams || adminTeams.length === 0) {
      return errorResponse("Insufficient permissions - only team admins can remove members", 403)
    }

    // Prevent admin from deleting themselves
    if (memberId === user.id) {
      return errorResponse("Cannot remove yourself from the organization", 400)
    }

    // Get all teams in this organization
    const { data: teams } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", organizationId)

    if (!teams || teams.length === 0) {
      return errorResponse("No teams found in organization", 404)
    }

    const teamIds = teams.map(t => t.id)

    // Delete member from ALL teams in this organization
    const { error: deleteError } = await serviceClient
      .from("team_members")
      .delete()
      .in("team_id", teamIds)
      .eq("user_id", memberId)

    if (deleteError) {
      logger.error("Error deleting team members:", deleteError)
      return errorResponse("Failed to remove member", 500)
    }

    return jsonResponse({
      success: true,
      message: "Member removed from all teams in the organization"
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
