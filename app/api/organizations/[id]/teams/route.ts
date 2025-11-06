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

    // Not a workspace, so must be an organization - check organization membership
    const { data: orgMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!orgMember) {
      return errorResponse("Access denied - not a member of this organization", 403)
    }

    // OPTIMIZATION: Fetch teams, team members, and org members in parallel
    const [teamsResult, teamMembersResult, orgMembersResult] = await Promise.all([
      serviceClient
        .from("teams")
        .select("*")
        .eq("organization_id", organizationId),
      serviceClient
        .from("team_members")
        .select("team_id, user_id, role"),
      serviceClient
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organizationId)
    ])

    if (teamsResult.error) {
      logger.error("Error fetching teams:", teamsResult.error)
      return errorResponse("Failed to fetch teams", 500)
    }

    if (teamMembersResult.error) {
      logger.error("Error fetching team members:", teamMembersResult.error)
      return errorResponse("Failed to fetch team members", 500)
    }

    if (orgMembersResult.error) {
      logger.error("Error fetching organization members:", orgMembersResult.error)
      return errorResponse("Failed to fetch members", 500)
    }

    const teams = teamsResult.data || []
    const allTeamMembers = teamMembersResult.data || []
    const orgMembers = orgMembersResult.data || []

    // Get unique user IDs from team members
    const userIds = [...new Set(allTeamMembers.map(m => m.user_id))]

    // Fetch user profiles in one batch query
    const { data: userProfiles } = await serviceClient
      .from("user_profiles")
      .select("user_id, email, username")
      .in("user_id", userIds)

    // Create user lookup map for O(1) access
    const userMap = new Map(userProfiles?.map(u => [u.user_id, u]) || [])

    // Transform teams data with correct member counts
    const transformedTeams = teams.map((team: any) => {
      // Get team members for this specific team
      const teamMembers = allTeamMembers.filter(tm => tm.team_id === team.id)

      // Build members array with user details for this team
      const members = teamMembers.map(member => ({
        user_id: member.user_id,
        role: member.role,
        user: userMap.get(member.user_id) || { user_id: member.user_id, email: 'Unknown', username: null }
      }))

      return {
        ...team,
        member_count: teamMembers.length, // Actual team member count
        user_role: teamMembers.find(tm => tm.user_id === user.id)?.role || null,
        team_members: members // Team-specific members
      }
    })

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