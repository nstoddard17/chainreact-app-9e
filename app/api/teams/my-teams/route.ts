import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"
import { queryWithTimeout } from "@/lib/utils/fetch-with-timeout"

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Vercel: max 10 seconds for this endpoint

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
    // Step 1: Get user's team memberships (with 6s timeout)
    const { data: teamMemberships, error: membershipError } = await queryWithTimeout(
      serviceSupabase
        .from('team_members')
        .select('team_id, role, joined_at')
        .eq('user_id', user.id),
      6000 // 6 second timeout
    )

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

    // Step 2: Get team details and member counts in parallel (with 6s timeout each)
    const teamIds = teamMemberships.map(tm => tm.team_id)

    const [teamsResult, allMembersResult] = await Promise.all([
      // Get team details
      queryWithTimeout(
        serviceSupabase
          .from('teams')
          .select('id, name, slug, description, organization_id, created_at')
          .in('id', teamIds),
        6000
      ),

      // Get all members for all teams in ONE query (batch lookup)
      queryWithTimeout(
        serviceSupabase
          .from('team_members')
          .select('team_id')
          .in('team_id', teamIds),
        6000
      )
    ])

    if (teamsResult.error) {
      logger.error('[My Teams API] Error fetching teams:', teamsResult.error)
      throw teamsResult.error
    }

    if (allMembersResult.error) {
      logger.error('[My Teams API] Error fetching members:', allMembersResult.error)
      throw allMembersResult.error
    }

    logger.debug('[My Teams API] Teams and members fetched:', {
      teamsCount: teamsResult.data?.length || 0,
      membersCount: allMembersResult.data?.length || 0,
      elapsed: Date.now() - startTime
    })

    // Step 3: Count members per team in memory (fast)
    const countMap = new Map<string, number>()
    allMembersResult.data?.forEach(member => {
      countMap.set(member.team_id, (countMap.get(member.team_id) || 0) + 1)
    })

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
    const elapsed = Date.now() - startTime

    // Check if this is a timeout error
    const isTimeout = error?.message?.includes('timeout') ||
                     error?.message?.includes('timed out') ||
                     elapsed > 7500 // Close to 8s client timeout

    logger.error('[My Teams API] Error fetching teams:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      name: error?.name,
      isTimeout,
      elapsed
    })

    if (isTimeout) {
      return errorResponse(
        "Request timed out. Database query took too long. Please try again or contact support if this persists.",
        504 // Gateway Timeout
      )
    }

    return errorResponse(error.message || "Failed to fetch teams", 500)
  }
}
