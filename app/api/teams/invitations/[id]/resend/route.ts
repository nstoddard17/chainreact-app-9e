import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { sendTeamInvitationEmail } from '@/lib/services/resend'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// POST - Resend team invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invitationId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get invitation details
    const { data: invitation, error: inviteError } = await serviceClient
      .from("team_invitations")
      .select(`
        *
      `)
      .eq("id", invitationId)
      .single()

    if (inviteError || !invitation) {
      return errorResponse("Invitation not found", 404)
    }

    // Get team details
    const { data: team } = await serviceClient
      .from("teams")
      .select("id, name")
      .eq("id", invitation.team_id)
      .single()

    // Get inviter profile
    const { data: inviter } = await serviceClient
      .from("user_profiles")
      .select("id, email, full_name, username")
      .eq("id", invitation.inviter_id)
      .single()

    // Get invitee profile
    const { data: invitee } = await serviceClient
      .from("user_profiles")
      .select("id, email, full_name, username")
      .eq("id", invitation.invitee_id)
      .single()

    if (!team || !inviter || !invitee) {
      return errorResponse("Missing required data", 404)
    }

    // Check if user is team admin/manager
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", invitation.team_id)
      .eq("user_id", user.id)
      .single()

    if (!teamMember || !['owner', 'admin', 'manager'].includes(teamMember.role)) {
      return errorResponse("Only team owners, admins, and managers can resend invitations", 403)
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return errorResponse(`Cannot resend invitation that has been ${invitation.status}`, 400)
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      return errorResponse("Invitation has expired. Please create a new invitation.", 400)
    }

    // Create new notification for invitee
    const { error: notificationError } = await serviceClient
      .from("notifications")
      .insert({
        user_id: invitation.invitee_id,
        type: 'team_invitation',
        title: 'Team Invitation (Reminder)',
        message: `Reminder: You've been invited to join ${team.name}`,
        action_url: `/teams/invitations/${invitation.id}`,
        action_label: 'View Invitation',
        metadata: {
          invitation_id: invitation.id,
          team_id: invitation.team_id,
          team_name: team.name,
          role: invitation.role,
          is_reminder: true
        }
      })

    if (notificationError) {
      logger.error("Error creating notification:", notificationError)
      // Don't fail the request if notification fails
    }

    // Resend email notification
    const acceptUrl = `${getBaseUrl()}/teams/invitations/${invitation.id}`
    const emailResult = await sendTeamInvitationEmail(
      invitee.email,
      invitee.full_name || invitee.username || invitee.email,
      inviter.full_name || inviter.username || inviter.email,
      inviter.email,
      team.name,
      invitation.role,
      acceptUrl,
      invitation.expires_at
    )

    if (!emailResult.success) {
      logger.error("Error sending invitation email:", emailResult.error)
      return errorResponse("Failed to resend invitation email", 500)
    }

    return jsonResponse({
      message: "Invitation resent successfully",
      invitation: {
        id: invitation.id,
        team: team,
        invitee: invitee
      }
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
