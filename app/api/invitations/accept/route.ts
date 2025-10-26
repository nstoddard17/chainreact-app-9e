import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("You must be logged in to accept an invitation", 401)
    }

    const body = await request.json()
    const { token, team_id } = body

    if (!token) {
      return errorResponse("Token is required", 400)
    }

    // Get invitation details
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select(`
        *,
        organization:organizations(id, name, slug)
      `)
      .eq("token", token)
      .is("accepted_at", null) // Not already accepted
      .single()

    if (inviteError || !invitation) {
      return errorResponse("Invalid or expired invitation", 404)
    }

    // Check if invitation has expired
    const expiresAt = new Date(invitation.expires_at)
    const now = new Date()

    if (now > expiresAt) {
      return errorResponse("Invitation has expired", 410)
    }

    // Determine which team to add the user to
    // If team_id is provided in request, use it; otherwise use invitation's team_id or default team
    let targetTeamId = team_id || invitation.team_id

    // If no team specified, find the "General" team or first team in the organization
    if (!targetTeamId) {
      const { data: defaultTeam } = await serviceClient
        .from("teams")
        .select("id")
        .eq("organization_id", invitation.organization_id)
        .or("slug.eq.general,name.eq.General")
        .limit(1)
        .single()

      if (defaultTeam) {
        targetTeamId = defaultTeam.id
      } else {
        // Get first team if no General team exists
        const { data: firstTeam } = await serviceClient
          .from("teams")
          .select("id")
          .eq("organization_id", invitation.organization_id)
          .limit(1)
          .single()

        if (firstTeam) {
          targetTeamId = firstTeam.id
        } else {
          return errorResponse("No teams found in this organization", 500)
        }
      }
    }

    // Check if user is already a member of this team
    const { data: existingMember } = await serviceClient
      .from("team_members")
      .select("id")
      .eq("team_id", targetTeamId)
      .eq("user_id", user.id)
      .single()

    if (existingMember) {
      return errorResponse("You are already a member of this team", 409)
    }

    // Add user to the team
    const { data: newMember, error: addError } = await serviceClient
      .from("team_members")
      .insert({
        team_id: targetTeamId,
        user_id: user.id,
        role: invitation.role
      })
      .select("*")
      .single()

    if (addError) {
      logger.error("Error adding team member:", addError)
      return errorResponse("Failed to add you to the team", 500)
    }

    // Mark invitation as accepted
    const { error: updateError } = await serviceClient
      .from("organization_invitations")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: user.id
      })
      .eq("id", invitation.id)

    if (updateError) {
      logger.error("Error updating invitation:", updateError)
      // Don't fail the whole request if this fails
    }

    // Get team name for response
    const { data: team } = await serviceClient
      .from("teams")
      .select("name")
      .eq("id", targetTeamId)
      .single()

    return jsonResponse({
      success: true,
      message: `Successfully joined ${invitation.organization.name}${team ? ` (${team.name} team)` : ''}`,
      organization: invitation.organization,
      team_id: targetTeamId
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
