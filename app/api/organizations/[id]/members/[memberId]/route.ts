import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: organizationId, memberId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
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

    // Update member role
    const { data: updatedMember, error: updateError } = await serviceClient
      .from("organization_members")
      .update({ role })
      .eq("id", memberId)
      .eq("organization_id", organizationId)
      .select("*")
      .single()

    if (updateError) {
      console.error("Error updating member:", updateError)
      return NextResponse.json({ error: "Failed to update member" }, { status: 500 })
    }

    // Get user details for the updated member
    try {
      const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(updatedMember.user_id)
      const memberWithUserInfo = {
        ...updatedMember,
        user: {
          email: userData?.user?.email || "No email",
          full_name: userData?.user?.user_metadata?.full_name || "Unknown User",
          username: userData?.user?.user_metadata?.username || "unknown"
        }
      }
      return NextResponse.json(memberWithUserInfo)
    } catch (error) {
      console.error("Error fetching user data for updated member:", error)
      const memberWithUserInfo = {
        ...updatedMember,
        user: {
          email: "Error loading user",
          full_name: "Error loading user",
          username: "error"
        }
      }
      return NextResponse.json(memberWithUserInfo)
    }
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: organizationId, memberId } = await params
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    // Get the member to be deleted
    const { data: memberToDelete, error: memberError } = await serviceClient
      .from("organization_members")
      .select("*")
      .eq("id", memberId)
      .eq("organization_id", organizationId)
      .single()

    if (memberError || !memberToDelete) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Prevent admin from deleting themselves
    if (memberToDelete.user_id === user.id) {
      return NextResponse.json({ error: "Cannot remove yourself from the organization" }, { status: 400 })
    }

    // Delete the member
    const { error: deleteError } = await serviceClient
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", organizationId)

    if (deleteError) {
      console.error("Error deleting member:", deleteError)
      return NextResponse.json({ error: "Failed to delete member" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 