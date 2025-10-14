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

    // Check if user has access to this organization
    const { data: orgMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (!orgMember) {
      return errorResponse("Access denied" , 403)
    }

    // Get teams with member info
    const { data: teams, error } = await serviceClient
      .from("teams")
      .select(`
        *,
        team_members(user_id, role),
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
      user_role: team.team_members?.find((member: any) => member.user_id === user.id)?.role || null
    }))

    return jsonResponse(transformedTeams)
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

    // Check if user is organization admin
    const { data: orgMember } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (!orgMember || orgMember.role !== 'admin') {
      return errorResponse("Only organization admins can create teams" , 403)
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
        settings: {}
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