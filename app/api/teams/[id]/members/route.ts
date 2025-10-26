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

    // Get team members with user info
    const { data: members, error } = await serviceClient
      .from("team_members")
      .select(`
        *,
        user:profiles(email, full_name, username)
      `)
      .eq("team_id", teamId)

    if (error) {
      logger.error("Error fetching team members:", error)
      return errorResponse("Failed to fetch team members" , 500)
    }

    return jsonResponse(members)
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
      .select(`
        *,
        user:profiles(email, full_name, username)
      `)
      .single()

    if (addError) {
      logger.error("Error adding team member:", addError)
      return errorResponse("Failed to add team member" , 500)
    }

    return jsonResponse(newMember, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 