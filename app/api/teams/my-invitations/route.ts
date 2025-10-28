import { NextRequest } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// GET - Get current user's pending team invitations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get pending invitations for this user
    const { data: invitations, error } = await serviceClient
      .from("team_invitations")
      .select(`
        id,
        role,
        status,
        invited_at,
        expires_at,
        team_id
      `)
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("invited_at", { ascending: false })

    if (error) {
      logger.error("Error fetching team invitations:", error)
      return errorResponse("Failed to fetch invitations", 500)
    }

    // Get team details for each invitation
    const teamIds = invitations?.map(inv => inv.team_id) || []

    if (teamIds.length === 0) {
      return jsonResponse({ invitations: [] })
    }

    const { data: teams, error: teamError } = await serviceClient
      .from("teams")
      .select('id, name, description')
      .in('id', teamIds)

    if (teamError) {
      logger.error("Error fetching teams:", teamError)
    }

    // Merge invitations with team data
    const invitationsWithTeams = invitations?.map(invitation => ({
      ...invitation,
      team: teams?.find(t => t.id === invitation.team_id) || {
        id: invitation.team_id,
        name: 'Unknown Team',
        description: null
      }
    })) || []

    return jsonResponse({ invitations: invitationsWithTeams })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
