import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { sendTeamInvitationEmail } from '@/lib/services/resend'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Check if user is a member of this team
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember) {
      return errorResponse("Access denied" , 403)
    }

    // Get team members
    const { data: teamMembers, error } = await serviceClient
      .from("team_members")
      .select('user_id, role, joined_at')
      .eq("team_id", teamId)

    if (error) {
      logger.error("Error fetching team members:", error)
      return errorResponse("Failed to fetch team members" , 500)
    }

    // Get user profiles separately
    const userIds = teamMembers?.map(m => m.user_id) || []
    const { data: profiles, error: profileError } = await serviceClient
      .from("user_profiles")
      .select('id, email, full_name, username')
      .in('id', userIds)

    if (profileError) {
      logger.error("Error fetching user profiles:", profileError)
    }

    // Merge members with profile data
    const members = teamMembers?.map(member => ({
      ...member,
      user: profiles?.find(p => p.id === member.user_id) || { email: 'Unknown' }
    })) || []

    return jsonResponse({ members })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { user_id, role = 'member' } = body

    // Validate required fields
    if (!user_id) {
      return errorResponse("User ID is required" , 400)
    }

    // Check inviter's role - must not be on free tier
    const { data: inviterProfile } = await serviceClient
      .from("user_profiles")
      .select('role')
      .eq('id', user.id)
      .single()

    if (!inviterProfile || inviterProfile.role === 'free') {
      return errorResponse("Team invitations require a paid plan. Please upgrade your account." , 403)
    }

    // Check if user is team admin
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember || !['owner', 'admin', 'manager'].includes(teamMember.role)) {
      return errorResponse("Only team owners, admins, and managers can invite members" , 403)
    }

    // Check if user is already a member
    const { data: existingMember } = await serviceClient
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user_id)
      .single()

    if (existingMember) {
      return errorResponse("User is already a member of this team" , 409)
    }

    // Check if invitation already exists
    const { data: existingInvitation } = await serviceClient
      .from("team_invitations")
      .select("id, status")
      .eq("team_id", teamId)
      .eq("invitee_id", user_id)
      .eq("status", "pending")
      .single()

    if (existingInvitation) {
      return errorResponse("An invitation is already pending for this user" , 409)
    }

    // Verify team exists
    const { data: team, error: teamError } = await serviceClient
      .from("teams")
      .select("id, name, organization_id")
      .eq("id", teamId)
      .single()

    if (teamError || !team) {
      return errorResponse("Team not found", 404)
    }

    // Get invitee profile with role check
    const { data: inviteeProfile, error: inviteeError } = await serviceClient
      .from("user_profiles")
      .select('id, email, full_name, username, role')
      .eq('id', user_id)
      .single()

    if (inviteeError) {
      logger.error("Error fetching invitee profile:", inviteeError)
    }

    if (!inviteeProfile) {
      return errorResponse("User not found", 404)
    }

    // Log the invitee profile for debugging
    logger.debug("Invitee profile:", {
      id: inviteeProfile.id,
      email: inviteeProfile.email,
      role: inviteeProfile.role,
      has_role_field: 'role' in inviteeProfile
    })

    // Check invitee's role - must not be on free tier
    if (!inviteeProfile.role || inviteeProfile.role === 'free') {
      const userName = inviteeProfile.full_name || inviteeProfile.username || inviteeProfile.email
      return errorResponse(`${userName} is on the free plan. Users must have a paid plan to be invited to teams.`, 403)
    }

    // Create invitation
    const { data: invitation, error: inviteError } = await serviceClient
      .from("team_invitations")
      .insert({
        team_id: teamId,
        inviter_id: user.id,
        invitee_id: user_id,
        role
      })
      .select()
      .single()

    if (inviteError) {
      logger.error("Error creating team invitation:", inviteError)
      return errorResponse("Failed to create invitation" , 500)
    }

    // Create notification for invitee
    const { error: notificationError } = await serviceClient
      .from("notifications")
      .insert({
        user_id: user_id,
        type: 'team_invitation',
        title: 'Team Invitation',
        message: `You've been invited to join ${team.name}`,
        action_url: `/teams/invitations/${invitation.id}`,
        action_label: 'View Invitation',
        metadata: {
          invitation_id: invitation.id,
          team_id: teamId,
          team_name: team.name,
          role
        }
      })

    if (notificationError) {
      logger.error("Error creating notification:", notificationError)
      // Don't fail the request if notification fails
    }

    // Get inviter profile for email
    const { data: inviterProfileData } = await serviceClient
      .from("user_profiles")
      .select('email, full_name, username')
      .eq('id', user.id)
      .single()

    // Send email notification
    const acceptUrl = `${getBaseUrl()}/teams/invitations/${invitation.id}`
    const emailResult = await sendTeamInvitationEmail(
      inviteeProfile.email,
      inviteeProfile.full_name || inviteeProfile.username || inviteeProfile.email,
      inviterProfileData?.full_name || inviterProfileData?.username || inviterProfileData?.email || 'A team member',
      inviterProfileData?.email || 'noreply@chainreact.app',
      team.name,
      role,
      acceptUrl,
      invitation.expires_at
    )

    if (!emailResult.success) {
      logger.error("Error sending invitation email:", emailResult.error)
      // Don't fail the request if email fails - user still has in-app notification
    }

    return jsonResponse({
      invitation: {
        ...invitation,
        team: { id: team.id, name: team.name },
        invitee: inviteeProfile
      }
    }, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 