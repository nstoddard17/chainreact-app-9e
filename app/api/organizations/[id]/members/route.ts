import { NextRequest, NextResponse } from "next/server"
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is a member of this organization
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Get all members of the organization
    const { data: members, error } = await serviceClient
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })

    if (error) {
      logger.error("Error fetching members:", error)
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 })
    }

    // Get user details for each member
    const membersWithUserInfo = await Promise.all(
      members.map(async (member) => {
        try {
          const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(member.user_id)
          if (userError || !userData.user) {
            return {
              ...member,
              user: {
                email: "Unknown",
                full_name: "Unknown User",
                username: "unknown"
              }
            }
          }
          return {
            ...member,
            user: {
              email: userData.user.email || "No email",
              full_name: userData.user.user_metadata?.full_name || "Unknown User",
              username: userData.user.user_metadata?.username || "unknown"
            }
          }
        } catch (error) {
          logger.error("Error fetching user data for member:", member.user_id, error)
          return {
            ...member,
            user: {
              email: "Error loading user",
              full_name: "Error loading user",
              username: "error"
            }
          }
        }
      })
    )

    return NextResponse.json(membersWithUserInfo)
  } catch (error) {
    logger.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { user_id, role = "viewer" } = body

    if (!user_id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Check if user is admin of the organization
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Check if user is already a member
    const { data: existingMember, error: memberCheckError } = await serviceClient
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", user_id)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 })
    }

    // Add user to organization
    const { data: newMember, error: addError } = await serviceClient
      .from("organization_members")
      .insert({
        organization_id: organizationId,
        user_id,
        role
      })
      .select("*")
      .single()

    if (addError) {
      logger.error("Error adding member:", addError)
      return NextResponse.json({ error: "Failed to add member" }, { status: 500 })
    }

    // Get user details for the new member
    try {
      const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(user_id)
      const memberWithUserInfo = {
        ...newMember,
        user: {
          email: userData?.user?.email || "No email",
          full_name: userData?.user?.user_metadata?.full_name || "Unknown User",
          username: userData?.user?.user_metadata?.username || "unknown"
        }
      }
      return NextResponse.json(memberWithUserInfo, { status: 201 })
    } catch (error) {
      logger.error("Error fetching user data for new member:", error)
      const memberWithUserInfo = {
        ...newMember,
        user: {
          email: "Error loading user",
          full_name: "Error loading user",
          username: "error"
        }
      }
      return NextResponse.json(memberWithUserInfo, { status: 201 })
    }
  } catch (error) {
    logger.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}