import { NextRequest, NextResponse } from "next/server"
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is a member of this team
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
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
      return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 })
    }

    return NextResponse.json(members)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { user_id, role = 'member' } = body

    // Validate required fields
    if (!user_id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Check if user is team admin
    const { data: teamMember } = await serviceClient
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()

    if (!teamMember || !['admin', 'editor'].includes(teamMember.role)) {
      return NextResponse.json({ error: "Only team admins and editors can add members" }, { status: 403 })
    }

    // Check if user is already a member
    const { data: existingMember } = await serviceClient
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user_id)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: "User is already a member of this team" }, { status: 409 })
    }

    // Check if user is a member of the organization
    const { data: team } = await serviceClient
      .from("teams")
      .select("organization_id")
      .eq("id", teamId)
      .single()

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 })
    }

    const { data: orgMember } = await serviceClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", team.organization_id)
      .eq("user_id", user_id)
      .single()

    if (!orgMember) {
      return NextResponse.json({ error: "User must be a member of the organization first" }, { status: 403 })
    }

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
      return NextResponse.json({ error: "Failed to add team member" }, { status: 500 })
    }

    return NextResponse.json(newMember, { status: 201 })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 