import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get personal workspace
    const { data: workspace } = await serviceClient
      .from("workspaces")
      .select("*")
      .eq("owner_id", user.id)
      .single()

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

    // For each organization, get team count and member count
    const orgsWithCounts = await Promise.all(
      organizations.map(async (org: any) => {
        // Get teams count
        const { count: teamCount } = await serviceClient
          .from("teams")
          .select("id", { count: 'exact', head: true })
          .eq("organization_id", org.id)

        // Get unique member count across all teams
        const { data: teamMembers } = await serviceClient
          .from("teams")
          .select(`
            team_members(user_id)
          `)
          .eq("organization_id", org.id)

        const uniqueMembers = new Set<string>()
        teamMembers?.forEach((team: any) => {
          team.team_members?.forEach((tm: any) => {
            uniqueMembers.add(tm.user_id)
          })
        })

        // Get user's highest role in this organization
        const { data: userTeamsInOrg } = await serviceClient
          .from("teams")
          .select(`
            team_members!inner(role)
          `)
          .eq("organization_id", org.id)
          .eq("team_members.user_id", user.id)

        const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 }
        let highestRole = 'viewer'
        userTeamsInOrg?.forEach((team: any) => {
          team.team_members?.forEach((tm: any) => {
            if ((roleHierarchy[tm.role as keyof typeof roleHierarchy] || 0) > (roleHierarchy[highestRole as keyof typeof roleHierarchy] || 0)) {
              highestRole = tm.role
            }
          })
        })

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
          user_role: highestRole,
          member_count: uniqueMembers.size,
          team_count: teamCount || 0
        }
      })
    )

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
        team_count: 0
      })
    }

    results.push(...orgsWithCounts)

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

    // Create default "General" team
    const { data: team, error: teamError } = await serviceClient
      .from("teams")
      .insert({
        organization_id: organization.id,
        name: "General",
        slug: "general",
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
