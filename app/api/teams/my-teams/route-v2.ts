import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"
import { queryWithTimeout } from "@/lib/utils/fetch-with-timeout"

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Vercel: max 10 seconds for this endpoint

/**
 * ALTERNATIVE IMPLEMENTATION - Uses Supabase RPC function for better performance
 *
 * This version uses a database function to do all the work server-side,
 * which is much faster than multiple client queries.
 */

// GET - Get all teams the current user is a member of
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    logger.debug('[My Teams API v2] Starting', { elapsed: 0 })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.error('[My Teams API v2] Auth error:', authError)
      return errorResponse("Unauthorized", 401)
    }

    logger.debug('[My Teams API v2] User authenticated', {
      userId: user.id,
      elapsed: Date.now() - startTime
    })

    // Single query approach with proper select syntax
    const query = supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        joined_at,
        team:teams!inner (
          id,
          name,
          slug,
          description,
          organization_id,
          created_at
        )
      `)
      .eq('user_id', user.id)

    logger.debug('[My Teams API v2] Executing query', {
      elapsed: Date.now() - startTime
    })

    const { data: memberships, error: queryError } = await queryWithTimeout(
      query,
      6000 // 6 second timeout
    )

    if (queryError) {
      logger.error('[My Teams API v2] Query error:', {
        message: queryError.message,
        details: queryError.details,
        elapsed: Date.now() - startTime
      })
      throw queryError
    }

    logger.debug('[My Teams API v2] Query complete', {
      membershipCount: memberships?.length || 0,
      elapsed: Date.now() - startTime
    })

    if (!memberships || memberships.length === 0) {
      logger.debug('[My Teams API v2] No memberships found', {
        elapsed: Date.now() - startTime
      })
      return jsonResponse({ teams: [] })
    }

    // Now get member counts for each team in a single query
    const teamIds = memberships.map(m => m.team_id)

    logger.debug('[My Teams API v2] Fetching member counts', {
      teamCount: teamIds.length,
      elapsed: Date.now() - startTime
    })

    const { data: memberCounts, error: countError } = await queryWithTimeout(
      supabase
        .from('team_members')
        .select('team_id')
        .in('team_id', teamIds),
      5000 // 5 second timeout
    )

    if (countError) {
      logger.warn('[My Teams API v2] Error fetching member counts, continuing without counts:', countError)
    }

    logger.debug('[My Teams API v2] Member counts fetched', {
      totalMembers: memberCounts?.length || 0,
      elapsed: Date.now() - startTime
    })

    // Count members per team
    const countMap = new Map<string, number>()
    memberCounts?.forEach(m => {
      countMap.set(m.team_id, (countMap.get(m.team_id) || 0) + 1)
    })

    // Transform data
    const teams = memberships.map((m: any) => ({
      ...m.team,
      user_role: m.role,
      joined_at: m.joined_at,
      member_count: countMap.get(m.team_id) || 0
    }))

    logger.debug('[My Teams API v2] Response ready', {
      teamCount: teams.length,
      totalElapsed: Date.now() - startTime
    })

    return jsonResponse({ teams })

  } catch (error: any) {
    const elapsed = Date.now() - startTime

    const isTimeout = error?.message?.includes('timeout') ||
                     error?.message?.includes('timed out') ||
                     elapsed > 7500

    logger.error('[My Teams API v2] Error:', {
      message: error?.message,
      details: error?.details,
      code: error?.code,
      isTimeout,
      elapsed
    })

    if (isTimeout) {
      return errorResponse(
        "Request timed out. Database query took too long. Please try again.",
        504
      )
    }

    return errorResponse(error.message || "Failed to fetch teams", 500)
  }
}
