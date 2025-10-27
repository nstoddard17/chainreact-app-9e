import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Check if user is a member of this team
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember) {
      return errorResponse("Access denied" , 403)
    }

    // Get team members
    const { data: teamMembers, error } = await serviceClient
      .from("team_members")
      .select('user_id, role, joined_at')
      .eq("team_id", teamId)

    if (error) {
      logger.error("Error fetching team members:", error)
      return errorResponse("Failed to fetch team members" , 500)
    }

    // Get user profiles separately
    const userIds = teamMembers?.map(m => m.user_id) || []
    const { data: profiles, error: profileError } = await serviceClient
      .from("user_profiles")
      .select('id, email, full_name, username')
      .in('id', userIds)

    if (profileError) {
      logger.error("Error fetching user profiles:", profileError)
    }

    // Merge members with profile data
    const members = teamMembers?.map(member => ({
      ...member,
      user: profiles?.find(p => p.id === member.user_id) || { email: 'Unknown' }
    })) || []

    return jsonResponse({ members })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { user_id, role = 'member' } = body

    // Validate required fields
    if (!user_id) {
      return errorResponse("User ID is required" , 400)
    }

    // Check if user is team admin
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember || !['admin', 'editor'].includes(teamMember.role)) {
      return errorResponse("Only team admins and editors can add members" , 403)
    }

    // Check if user is already a member
    const { data: existingMember } = await serviceClient
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user_id)
      .single()

    if (existingMember) {
      return errorResponse("User is already a member of this team" , 409)
    }

    // Verify team exists
    const { data: team, error: teamError } = await serviceClient
      .from("teams")
      .select("id, name, organization_id")
      .eq("id", teamId)
      .single()

    if (teamError || !team) {
      return errorResponse("Team not found", 404)
    }

    // Note: In the new schema, users can be added directly to teams
    // No need to check organization membership first

    // Add user to team
    const { data: newMember, error: addError } = await serviceClient
      .from("team_members")
      .insert({
        team_id: teamId,
        user_id,
        role
      })
      .select('user_id, role, joined_at')
      .single()

    if (addError) {
      logger.error("Error adding team member:", addError)
      return errorResponse("Failed to add team member" , 500)
    }

    // Get user profile separately
    const { data: userProfile } = await serviceClient
      .from("user_profiles")
      .select('id, email, full_name, username')
      .eq('id', user_id)
      .single()

    return jsonResponse({
      member: {
        ...newMember,
        user: userProfile || { email: 'Unknown' }
      }
    }, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 