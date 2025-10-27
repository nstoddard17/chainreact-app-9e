import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// GET - Get all teams the current user is a member of
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get all teams where user is a member
    const { data: teamMemberships, error: membershipError } = await supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        joined_at,
        team:teams(
          id,
          name,
          slug,
          description,
          organization_id,
          workspace_id,
          created_at
        )
      `)
      .eq('user_id', user.id)

    if (membershipError) {
      logger.error("Error fetching team memberships:", membershipError)
      throw membershipError
    }

    // Transform the data to include role with team details
    const teams = (teamMemberships || [])
      .filter((tm: any) => tm.team) // Filter out any null teams
      .map((tm: any) => ({
        ...tm.team,
        user_role: tm.role,
        joined_at: tm.joined_at
      }))

    // For each team, get member count
    const teamsWithCounts = await Promise.all(
      teams.map(async (team: any) => {
        const { count } = await supabase
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', team.id)

        return {
          ...team,
          member_count: count || 0
        }
      })
    )

    return jsonResponse({ teams: teamsWithCounts })
  } catch (error: any) {
    logger.error("Error fetching team:", error)
    return errorResponse(error.message || "Failed to fetch teams", 500)
  }
}
