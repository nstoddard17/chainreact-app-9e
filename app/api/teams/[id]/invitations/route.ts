import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// GET - Get pending invitations for a team
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
      return errorResponse("Unauthorized", 401)
    }

    // Check if user is a team admin/manager
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember || !['owner', 'admin', 'manager'].includes(teamMember.role)) {
      return errorResponse("Only team owners, admins, and managers can view invitations", 403)
    }

    // Get pending invitations
    const { data: invitations, error } = await serviceClient
      .from("team_invitations")
      .select(`
        id,
        role,
        status,
        invited_at,
        expires_at,
        invitee_id
      `)
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("invited_at", { ascending: false })

    if (error) {
      logger.error("Error fetching team invitations:", error)
      return errorResponse("Failed to fetch invitations", 500)
    }

    // Get user profiles for invitees
    const inviteeIds = invitations?.map(inv => inv.invitee_id) || []

    if (inviteeIds.length === 0) {
      return jsonResponse({ invitations: [] })
    }

    const { data: profiles, error: profileError } = await serviceClient
      .from("user_profiles")
      .select('id, email, full_name, username')
      .in('id', inviteeIds)

    if (profileError) {
      logger.error("Error fetching invitee profiles:", profileError)
    }

    // Merge invitations with profile data
    const invitationsWithProfiles = invitations?.map(invitation => ({
      ...invitation,
      invitee: profiles?.find(p => p.id === invitation.invitee_id) || {
        id: invitation.invitee_id,
        email: 'Unknown',
        full_name: null,
        username: null
      }
    })) || []

    return jsonResponse({ invitations: invitationsWithProfiles })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
