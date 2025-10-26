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
      return errorResponse("Unauthorized" , 401)
    }

    // Check if this is a personal workspace (no teams)
    const { data: workspace } = await serviceClient
      .from("workspaces")
      .select("id, owner_id")
      .eq("id", organizationId)
      .single()

    if (workspace) {
      // Personal workspace - check ownership
      if (workspace.owner_id !== user.id) {
        return errorResponse("Access denied - not the workspace owner", 403)
      }

      // Personal workspaces have no teams
      return jsonResponse({ teams: [] })
    }

    // Not a workspace, so must be an organization - check team membership
    // First get all team IDs the user is a member of
    const { data: userTeamMemberships } = await serviceClient
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)

    const userTeamIds = userTeamMemberships?.map(tm => tm.team_id) || []

    // Then check if any of those teams belong to this organization
    const { data: userTeams } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", userTeamIds)

    if (!userTeams || userTeams.length === 0) {
      return errorResponse("Access denied - not a member of any team in this organization", 403)
    }

    // Get teams with member info
    const { data: teams, error } = await serviceClient
      .from("teams")
      .select(`
        *,
        team_members(
          user_id,
          role,
          user:users(id, email, username)
        ),
        member_count:team_members(count)
      `)
      .eq("organization_id", organizationId)

    if (error) {
      logger.error("Error fetching teams:", error)
      return errorResponse("Failed to fetch teams" , 500)
    }

    // Transform the data
    const transformedTeams = teams.map((team: any) => ({
      ...team,
      member_count: team.member_count?.[0]?.count || 0,
      user_role: team.team_members?.find((member: any) => member.user_id === user.id)?.role || null,
      members: team.team_members || []
    }))

    return jsonResponse({ teams: transformedTeams })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(
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
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { name, description, slug, color } = body

    // Validate required fields
    if (!name || !slug) {
      return errorResponse("Name and slug are required" , 400)
    }

    // Check if user is an admin of any team in this organization
    const { data: adminTeams } = await serviceClient
      .from("teams")
      .select(`
        id,
        team_members!inner(role)
      `)
      .eq("organization_id", organizationId)
      .eq("team_members.user_id", user.id)
      .eq("team_members.role", "admin")

    if (!adminTeams || adminTeams.length === 0) {
      return errorResponse("Only organization admins can create teams", 403)
    }

    // Check if slug already exists in this organization
    const { data: existingTeam } = await serviceClient
      .from("teams")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", slug)
      .single()

    if (existingTeam) {
      return errorResponse("Team slug already exists in this organization" , 409)
    }

    // Create team
    const { data: team, error: createError } = await serviceClient
      .from("teams")
      .insert({
        organization_id: organizationId,
        name,
        description,
        slug,
        color: color || '#3B82F6',
        settings: {},
        created_by: user.id
      })
      .select()
      .single()

    if (createError) {
      logger.error("Error creating team:", createError)
      return errorResponse("Failed to create team" , 500)
    }

    // Add creator as team admin
    const { error: memberError } = await serviceClient
      .from("team_members")
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: "admin"
      })

    if (memberError) {
      logger.error("Error creating team member:", memberError)
      // Don't fail the request, team was created successfully
    }

    return jsonResponse(team, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 