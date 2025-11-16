import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"
import { queryWithTimeout } from "@/lib/utils/fetch-with-timeout"

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Vercel: max 10 seconds for this endpoint

/**
 * GET - Get teams overview (teams + invitations in one call)
 * Combines data from /api/teams/my-teams and /api/teams/my-invitations
 * for faster page load performance
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Authenticate
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.error('[Teams Overview API] Auth error:', authError)
      return errorResponse("Unauthorized", 401)
    }

    logger.debug('[Teams Overview API] Fetching teams and invitations for user:', {
      userId: user.id,
      elapsed: Date.now() - startTime
    })

    // Use service role client
    const serviceSupabase = await createSupabaseServiceClient()

    // Fetch teams and invitations in PARALLEL for maximum speed
    const [teamMembershipsResult, invitationsResult] = await Promise.all([
      // Get user's team memberships
      queryWithTimeout(
        serviceSupabase
          .from('team_members')
          .select('team_id, role, joined_at')
          .eq('user_id', user.id),
        6000 // 6 second timeout
      ),

      // Get pending invitations
      queryWithTimeout(
        serviceSupabase
          .from("team_invitations")
          .select('id, role, status, invited_at, expires_at, team_id')
          .eq("invitee_id", user.id)
          .eq("status", "pending")
          .order("invited_at", { ascending: false }),
        6000 // 6 second timeout
      )
    ])

    // Handle teams data
    let teams: any[] = []
    if (teamMembershipsResult.error) {
      logger.error('[Teams Overview API] Error fetching team memberships:', teamMembershipsResult.error)
    } else if (teamMembershipsResult.data && teamMembershipsResult.data.length > 0) {
      const teamMemberships = teamMembershipsResult.data
      const teamIds = teamMemberships.map(tm => tm.team_id)

      // Fetch team details and member counts in parallel
      const [teamsResult, allMembersResult] = await Promise.all([
        queryWithTimeout(
          serviceSupabase
            .from('teams')
            .select('id, name, slug, description, organization_id, created_at')
            .in('id', teamIds),
          6000
        ),
        queryWithTimeout(
          serviceSupabase
            .from('team_members')
            .select('team_id')
            .in('team_id', teamIds),
          6000
        )
      ])

      if (!teamsResult.error && !allMembersResult.error) {
        // Count members per team in memory
        const countMap = new Map<string, number>()
        allMembersResult.data?.forEach(member => {
          countMap.set(member.team_id, (countMap.get(member.team_id) || 0) + 1)
        })

        teams = teamMemberships
          .map((tm: any) => {
            const team = teamsResult.data?.find(t => t.id === tm.team_id)
            if (!team) return null

            return {
              ...team,
              user_role: tm.role,
              joined_at: tm.joined_at,
              member_count: countMap.get(tm.team_id) || 0
            }
          })
          .filter(Boolean)
      }
    }

    // Handle invitations data
    let invitations: any[] = []
    if (invitationsResult.error) {
      logger.error('[Teams Overview API] Error fetching invitations:', invitationsResult.error)
    } else if (invitationsResult.data && invitationsResult.data.length > 0) {
      const teamIds = invitationsResult.data.map(inv => inv.team_id)

      const { data: invitationTeams, error: teamError } = await queryWithTimeout(
        serviceSupabase
          .from("teams")
          .select('id, name, description')
          .in('id', teamIds),
        6000
      )

      if (!teamError && invitationTeams) {
        invitations = invitationsResult.data.map(invitation => ({
          ...invitation,
          team: invitationTeams.find(t => t.id === invitation.team_id) || {
            id: invitation.team_id,
            name: 'Unknown Team',
            description: null
          }
        }))
      }
    }

    logger.debug('[Teams Overview API] Successfully fetched overview:', {
      teamsCount: teams.length,
      invitationsCount: invitations.length,
      totalElapsed: Date.now() - startTime
    })

    return jsonResponse({
      teams,
      invitations
    })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    const isTimeout = error?.message?.includes('timeout') || elapsed > 7500

    logger.error('[Teams Overview API] Error:', {
      message: error?.message,
      isTimeout,
      elapsed
    })

    if (isTimeout) {
      return errorResponse(
        "Request timed out. Please try again.",
        504
      )
    }

    return errorResponse(error.message || "Failed to fetch teams overview", 500)
  }
}
