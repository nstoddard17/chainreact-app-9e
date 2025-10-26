import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check if user is a member of any team in this organization
    const { data: userTeams } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id",
        serviceClient
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
      )

    if (!userTeams || userTeams.length === 0) {
      return errorResponse("Access denied - not a member of this organization", 403)
    }

    // Get all teams in the organization with their members
    const { data: teams, error: teamsError } = await serviceClient
      .from("teams")
      .select(`
        id,
        name,
        slug,
        team_members(
          user_id,
          role,
          created_at,
          user:users(id, email, username)
        )
      `)
      .eq("organization_id", organizationId)

    if (teamsError) {
      logger.error("Error fetching teams:", teamsError)
      return errorResponse("Failed to fetch members", 500)
    }

    // Collect all unique members from all teams
    const memberMap = new Map()
    teams?.forEach((team: any) => {
      team.team_members?.forEach((tm: any) => {
        if (!memberMap.has(tm.user_id)) {
          memberMap.set(tm.user_id, {
            id: tm.user_id,
            user_id: tm.user_id,
            user: tm.user,
            role: tm.role,
            created_at: tm.created_at,
            teams: [{ id: team.id, name: team.name, slug: team.slug, role: tm.role }]
          })
        } else {
          const existing = memberMap.get(tm.user_id)
          existing.teams.push({ id: team.id, name: team.name, slug: team.slug, role: tm.role })
          // Keep the highest role (owner > admin > member > viewer)
          const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 }
          if ((roleHierarchy[tm.role as keyof typeof roleHierarchy] || 0) > (roleHierarchy[existing.role as keyof typeof roleHierarchy] || 0)) {
            existing.role = tm.role
          }
        }
      })
    })

    const members = Array.from(memberMap.values())

    return jsonResponse({ members })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

// POST is deprecated - members should be added to teams, not directly to organizations
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return errorResponse("Members must be added to teams. Use /api/teams/[id]/members instead.", 400)
}
