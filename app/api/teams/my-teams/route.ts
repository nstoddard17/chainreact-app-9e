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
    // The RLS policy on teams table blocks foreign key joins from team_members
    const { createSupabaseServiceClient } = await import("@/utils/supabase/server")
    const serviceSupabase = await createSupabaseServiceClient()

    // Get all teams where user is a member
    // Use abortSignal to timeout the query if it takes too long
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      logger.error('[My Teams API] Query timeout after 10 seconds')
      controller.abort()
    }, 10000) // 10 second timeout

    try {
      const { data: teamMemberships, error: membershipError } = await serviceSupabase
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
            created_at
          )
        `)
        .eq('user_id', user.id)
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

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

      logger.debug('[My Teams API] Team memberships fetched:', {
        count: teamMemberships?.length || 0,
        elapsed: Date.now() - startTime,
        rawData: teamMemberships
      })

      // Transform the data to include role with team details
      const teams = (teamMemberships || [])
        .filter((tm: any) => {
          const hasTeam = !!tm.team
          if (!hasTeam) {
            logger.error('[My Teams API] Team membership has null team:', {
              teamId: tm.team_id,
              userId: tm.user_id,
              role: tm.role
            })
          }
          return hasTeam
        })
        .map((tm: any) => ({
          ...tm.team,
          user_role: tm.role,
          joined_at: tm.joined_at
        }))

      logger.debug('[My Teams API] Teams after transform:', {
        count: teams.length,
        filteredOut: (teamMemberships?.length || 0) - teams.length,
        elapsed: Date.now() - startTime
      })

      // For each team, get member count (using service client)
      const teamsWithCounts = await Promise.all(
        teams.map(async (team: any) => {
          const { count, error: countError } = await serviceSupabase
            .from('team_members')
            .select('id', { count: 'exact', head: true })
            .eq('team_id', team.id)

          if (countError) {
            logger.error('[My Teams API] Error counting team members:', {
              teamId: team.id,
              error: countError
            })
          }

          return {
            ...team,
            member_count: count || 0
          }
        })
      )

      logger.debug('[My Teams API] Successfully fetched teams:', {
        count: teamsWithCounts.length,
        totalElapsed: Date.now() - startTime
      })

      return jsonResponse({ teams: teamsWithCounts })
    } catch (queryError: any) {
      if (queryError.name === 'AbortError') {
        logger.error('[My Teams API] Query was aborted due to timeout', {
          elapsed: Date.now() - startTime
        })
        return errorResponse("Request timed out. The database query took too long to complete.", 504)
      }
      throw queryError
    }
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
