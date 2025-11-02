import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

// GET - Get all teams the current user is a member of
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // First authenticate with regular client
    const supabase = await createSupabaseRouteHandlerClient()
    logger.debug('[My Teams API] Supabase client created', { elapsed: Date.now() - startTime })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.error('[My Teams API] Auth error:', authError)
      return errorResponse("Unauthorized", 401)
    }

    logger.debug('[My Teams API] Auth complete, fetching teams for user:', {
      userId: user.id,
      elapsed: Date.now() - startTime
    })

    // Use service role client to bypass RLS for this query
    // This is safe because we're explicitly filtering by user.id
    const { createSupabaseServiceClient } = await import("@/utils/supabase/server")
    const serviceSupabase = await createSupabaseServiceClient()

    // Split query into two separate calls to avoid slow joins
    // Step 1: Get user's team memberships
    const { data: teamMemberships, error: membershipError } = await serviceSupabase
      .from('team_members')
      .select('team_id, role, joined_at')
      .eq('user_id', user.id)

    if (membershipError) {
      logger.error('[My Teams API] Error fetching team memberships:', {
        message: membershipError.message,
        details: membershipError.details,
        hint: membershipError.hint,
        code: membershipError.code,
        elapsed: Date.now() - startTime
      })
      throw membershipError
    }

    if (!teamMemberships || teamMemberships.length === 0) {
      logger.debug('[My Teams API] No team memberships found', {
        elapsed: Date.now() - startTime
      })
      return jsonResponse({ teams: [] })
    }

    logger.debug('[My Teams API] Team memberships fetched:', {
      count: teamMemberships.length,
      elapsed: Date.now() - startTime
    })

    // Step 2: Get team details and member counts in parallel
    const teamIds = teamMemberships.map(tm => tm.team_id)

    const [teamsResult, countsResult] = await Promise.all([
      // Get team details
      serviceSupabase
        .from('teams')
        .select('id, name, slug, description, organization_id, created_at')
        .in('id', teamIds),

      // Get member counts for all teams at once
      Promise.all(
        teamIds.map(async (teamId) => {
          const { count } = await serviceSupabase
            .from('team_members')
            .select('id', { count: 'exact', head: true })
            .eq('team_id', teamId)
          return { teamId, count: count || 0 }
        })
      )
    ])

    if (teamsResult.error) {
      logger.error('[My Teams API] Error fetching teams:', teamsResult.error)
      throw teamsResult.error
    }

    logger.debug('[My Teams API] Teams and counts fetched:', {
      teamsCount: teamsResult.data?.length || 0,
      elapsed: Date.now() - startTime
    })

    // Step 3: Merge everything together
    const countMap = new Map(countsResult.map(c => [c.teamId, c.count]))

    const teams = teamMemberships
      .map((tm: any) => {
        const team = teamsResult.data?.find(t => t.id === tm.team_id)
        if (!team) {
          logger.error('[My Teams API] Team not found for membership:', {
            teamId: tm.team_id,
            userId: user.id
          })
          return null
        }

        return {
          ...team,
          user_role: tm.role,
          joined_at: tm.joined_at,
          member_count: countMap.get(tm.team_id) || 0
        }
      })
      .filter(Boolean) // Remove nulls

    logger.debug('[My Teams API] Teams merged:', {
      count: teams.length,
      elapsed: Date.now() - startTime
    })

    logger.debug('[My Teams API] Successfully fetched teams:', {
      count: teams.length,
      totalElapsed: Date.now() - startTime
    })

    return jsonResponse({ teams })
  } catch (error: any) {
    logger.error('[My Teams API] Error fetching teams:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      stack: error?.stack,
      name: error?.name
    })
    return errorResponse(error.message || "Failed to fetch teams", 500)
  }
}
