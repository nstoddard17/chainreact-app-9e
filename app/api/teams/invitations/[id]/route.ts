import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

// GET - Get invitation details
export async function GET(
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

    // Get invitation with team details
    const { data: invitation, error } = await serviceClient
      .from("team_invitations")
      .select(`
        *,
        team:teams(id, name, description),
        inviter:inviter_id(id, email, full_name)
      `)
      .eq("id", invitationId)
      .eq("invitee_id", user.id)
      .single()

    if (error || !invitation) {
      return errorResponse("Invitation not found", 404)
    }

    return jsonResponse({ invitation })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// POST - Accept invitation
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

    // Get invitation
    const { data: invitation, error: inviteError } = await serviceClient
      .from("team_invitations")
      .select("*, team:teams(id, name)")
      .eq("id", invitationId)
      .eq("invitee_id", user.id)
      .single()

    if (inviteError || !invitation) {
      return errorResponse("Invitation not found", 404)
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return errorResponse(`Invitation has already been ${invitation.status}`, 400)
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      // Mark as expired
      await serviceClient
        .from("team_invitations")
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq("id", invitationId)

      return errorResponse("Invitation has expired", 400)
    }

    // Add user to team
    const { error: addMemberError } = await serviceClient
      .from("team_members")
      .insert({
        team_id: invitation.team_id,
        user_id: user.id,
        role: invitation.role
      })

    if (addMemberError) {
      logger.error("Error adding team member:", addMemberError)
      return errorResponse("Failed to join team", 500)
    }

    // Update invitation status
    const { error: updateError } = await serviceClient
      .from("team_invitations")
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", invitationId)

    if (updateError) {
      logger.error("Error updating invitation:", updateError)
    }

    // Mark notification as read
    await serviceClient
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("metadata->invitation_id", invitationId)
      .eq("user_id", user.id)

    return jsonResponse({
      message: "Successfully joined team",
      team: invitation.team
    })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// DELETE - Reject invitation
export async function DELETE(
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

    // Get invitation
    const { data: invitation, error: inviteError } = await serviceClient
      .from("team_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("invitee_id", user.id)
      .single()

    if (inviteError || !invitation) {
      return errorResponse("Invitation not found", 404)
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return errorResponse(`Invitation has already been ${invitation.status}`, 400)
    }

    // Update invitation status
    const { error: updateError } = await serviceClient
      .from("team_invitations")
      .update({
        status: 'rejected',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", invitationId)

    if (updateError) {
      logger.error("Error updating invitation:", updateError)
      return errorResponse("Failed to reject invitation", 500)
    }

    // Mark notification as read
    await serviceClient
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("metadata->invitation_id", invitationId)
      .eq("user_id", user.id)

    return jsonResponse({ message: "Invitation rejected" })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
