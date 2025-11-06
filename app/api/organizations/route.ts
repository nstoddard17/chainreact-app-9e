import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check query parameters for optimization
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'all' // 'all' (default) | 'organizations_only'

    const includeWorkspace = type !== 'organizations_only'
    const includeStandaloneTeams = type !== 'organizations_only'

    // Get personal workspace (may not exist) - ONLY if needed
    let workspace = null
    if (includeWorkspace) {
      const { data: workspaceData, error: workspaceError } = await serviceClient
        .from("workspaces")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (workspaceError) {
        logger.error("Error fetching workspace:", workspaceError)
        // Continue - workspace is optional
      } else {
        workspace = workspaceData
      }
    }

    // Get organizations where user is a member of at least one team
    const { data: userTeams, error: teamsError } = await serviceClient
      .from("team_members")
      .select(`
        team:teams(
          id,
          organization_id
        )
      `)
      .eq("user_id", user.id)

    if (teamsError) {
      logger.error("Error fetching user teams:", teamsError)
      return errorResponse("Failed to fetch teams", 500)
    }

    // Extract unique organization IDs
    const orgIds = new Set<string>()
    userTeams?.forEach((tm: any) => {
      if (tm.team?.organization_id) {
        orgIds.add(tm.team.organization_id)
      }
    })

    // Fetch full organization details
    let organizations: any[] = []
    if (orgIds.size > 0) {
      const { data: orgs, error: orgsError } = await serviceClient
        .from("organizations")
        .select("*")
        .in("id", Array.from(orgIds))

      if (orgsError) {
        logger.error("Error fetching organizations:", orgsError)
        return errorResponse("Failed to fetch organizations", 500)
      }

      organizations = orgs || []
    }

    // OPTIMIZATION: Batch fetch ALL data in PARALLEL, then merge in memory
    // This prevents N+1 queries and is much faster
    const orgIds_array = Array.from(orgIds)

    // Build query array based on what's needed
    const queries = [
      // Get all teams for all organizations
      queryWithTimeout(
        serviceClient
          .from("teams")
          .select("id, organization_id")
          .in("organization_id", orgIds_array),
        6000
      ),
      // Get all team members for all organizations
      queryWithTimeout(
        serviceClient
          .from("team_members")
          .select(`
            user_id,
            role,
            team:teams!inner(organization_id)
          `)
          .in("teams.organization_id", orgIds_array),
        6000
      ),
      // Get user's roles across all teams
      queryWithTimeout(
        serviceClient
          .from("team_members")
          .select(`
            role,
            team:teams!inner(organization_id)
          `)
          .eq("user_id", user.id)
          .in("teams.organization_id", orgIds_array),
        6000
      )
    ]

    // Conditionally add standalone teams query
    if (includeStandaloneTeams) {
      queries.push(
        queryWithTimeout(
          serviceClient
            .from("team_members")
            .select(`
              team:teams(
                id,
                name,
                slug,
                description,
                created_at,
                updated_at,
                organization_id
              ),
              role
            `)
            .eq("user_id", user.id),
          6000
        )
      )
    }

    const queryResults = await Promise.all(queries)

    // Destructure results based on what was fetched
    const { data: allTeams } = queryResults[0]
    const { data: allMembers } = queryResults[1]
    const { data: userRoles } = queryResults[2]
    const standaloneTeams = includeStandaloneTeams ? queryResults[3]?.data : null
    const standaloneTeamsError = includeStandaloneTeams ? queryResults[3]?.error : null

    // Group data by organization_id for fast lookup
    const teamsByOrg = new Map<string, number>()
    allTeams?.forEach(team => {
      teamsByOrg.set(team.organization_id, (teamsByOrg.get(team.organization_id) || 0) + 1)
    })

    const membersByOrg = new Map<string, Set<string>>()
    allMembers?.forEach((member: any) => {
      const orgId = member.team?.organization_id
      if (orgId) {
        if (!membersByOrg.has(orgId)) {
          membersByOrg.set(orgId, new Set())
        }
        membersByOrg.get(orgId)!.add(member.user_id)
      }
    })

    const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 }
    const rolesByOrg = new Map<string, string>()
    userRoles?.forEach((role: any) => {
      const orgId = role.team?.organization_id
      if (orgId) {
        const current = rolesByOrg.get(orgId) || 'viewer'
        if ((roleHierarchy[role.role as keyof typeof roleHierarchy] || 0) > (roleHierarchy[current as keyof typeof roleHierarchy] || 0)) {
          rolesByOrg.set(orgId, role.role)
        }
      }
    })

    // Now map organizations with pre-computed counts
    const orgsWithCounts = organizations.map((org: any) => {
        const members = membersByOrg.get(org.id)
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          description: org.description,
          logo_url: org.logo_url,
          settings: org.settings,
          owner_id: org.owner_id,
          billing_email: org.billing_email,
          billing_address: org.billing_address,
          created_at: org.created_at,
          updated_at: org.updated_at,
          user_role: rolesByOrg.get(org.id) || 'viewer',
          member_count: members ? members.size : 0,
          team_count: teamsByOrg.get(org.id) || 0
        }
      })

    // Add personal workspace if it exists
    const results = []
    if (workspace) {
      results.push({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        avatar_url: workspace.avatar_url,
        settings: workspace.settings,
        owner_id: workspace.owner_id,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
        user_role: 'owner',
        member_count: 1,
        team_count: 0,
        is_workspace: true  // Mark as personal workspace
      })
    }

    results.push(...orgsWithCounts)

    // Process standalone teams ONLY if requested (already fetched in parallel above)
    if (includeStandaloneTeams) {
      if (standaloneTeamsError) {
        logger.error("Error fetching standalone teams:", standaloneTeamsError)
        // Continue - standalone teams are optional
      }

      // Filter for teams without organization_id
      const standaloneTeamResults = standaloneTeams
        ?.filter((tm: any) => tm.team && !tm.team.organization_id)
        ?.map((tm: any) => tm.team) || []

      if (standaloneTeamResults.length > 0) {
        // OPTIMIZATION: Batch fetch member counts for ALL standalone teams in ONE query
        const standaloneTeamIds = standaloneTeamResults.map((t: any) => t.id)
        const { data: standaloneMembers } = await queryWithTimeout(
          serviceClient
            .from("team_members")
            .select("team_id, user_id")
            .in("team_id", standaloneTeamIds),
          6000
        )

        // Build member count map
        const memberCountByTeam = new Map<string, number>()
        standaloneMembers?.forEach((member: any) => {
          memberCountByTeam.set(member.team_id, (memberCountByTeam.get(member.team_id) || 0) + 1)
        })

        // Get user roles from already-fetched standaloneTeams data
        const rolesByTeam = new Map<string, string>()
        standaloneTeams
          ?.filter((tm: any) => tm.team && !tm.team.organization_id)
          ?.forEach((tm: any) => {
            rolesByTeam.set(tm.team.id, tm.role)
          })

        // Format standalone teams with counts
        const standaloneTeamsWithCounts = standaloneTeamResults.map((team: any) => ({
          id: team.id,
          name: team.name,
          slug: team.slug,
          description: team.description,
          created_at: team.created_at,
          updated_at: team.updated_at,
          user_role: rolesByTeam.get(team.id) || 'member',
          member_count: memberCountByTeam.get(team.id) || 1,
          team_count: 0,
          is_team: true // Mark as standalone team
        }))

        results.push(...standaloneTeamsWithCounts)
      }
    }

    return jsonResponse({ organizations: results })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check user's plan - must be business or organization tier
    const { data: userProfile } = await serviceClient
      .from("user_profiles")
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile || !['business', 'organization'].includes(userProfile.role)) {
      return errorResponse("Organization creation requires a Business or Organization plan. Please upgrade your account.", 403)
    }

    const body = await request.json()
    const { name, description } = body

    // Validate required fields
    if (!name) {
      return errorResponse("Name is required", 400)
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // Check if slug already exists
    const { data: existingOrg } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single()

    if (existingOrg) {
      return errorResponse("Organization with similar name already exists", 409)
    }

    // Create organization
    const { data: organization, error: createError } = await serviceClient
      .from("organizations")
      .insert({
        name,
        slug,
        description,
        owner_id: user.id,
        settings: {},
        billing_address: {}
      })
      .select()
      .single()

    if (createError) {
      logger.error("Error creating organization:", createError)
      return errorResponse("Failed to create organization", 500)
    }

    // Create default "General" team with unique slug
    // Generate unique slug by appending random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const { data: team, error: teamError } = await serviceClient
      .from("teams")
      .insert({
        organization_id: organization.id,
        name: "General",
        slug: `general-${randomSuffix}`,
        description: "Default team for " + organization.name,
        color: "#3B82F6",
        settings: {},
        created_by: user.id
      })
      .select()
      .single()

    if (teamError) {
      logger.error("Error creating default team:", teamError)
      // Don't fail - organization was created successfully
    }

    // Add creator as organization member (owner role)
    const { error: orgMemberError } = await serviceClient
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: "owner"
      })

    if (orgMemberError) {
      logger.error("Error adding creator to organization members:", orgMemberError)
      // Don't fail - organization was created successfully
    }

    // Add creator as admin of the default team
    if (team) {
      const { error: memberError } = await serviceClient
        .from("team_members")
        .insert({
          team_id: team.id,
          user_id: user.id,
          role: "admin"
        })

      if (memberError) {
        logger.error("Error adding creator to team:", memberError)
      }
    }

    // Return the created organization
    const result = {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description,
      logo_url: organization.logo_url,
      settings: organization.settings,
      owner_id: organization.owner_id,
      billing_email: organization.billing_email,
      billing_address: organization.billing_address,
      created_at: organization.created_at,
      updated_at: organization.updated_at,
      user_role: "admin",
      member_count: 1,
      team_count: 1
    }

    return jsonResponse({ organization: result }, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error", 500)
  }
}
