import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

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
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['admin', 'editor', 'viewer'].includes(role)) {
      return errorResponse("Invalid role" , 400)
    }

    // Check if user is admin of the organization
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      return errorResponse("Insufficient permissions" , 403)
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
      logger.error("Error updating member:", updateError)
      return errorResponse("Failed to update member" , 500)
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
      return jsonResponse(memberWithUserInfo)
    } catch (error) {
      logger.error("Error fetching user data for updated member:", error)
      const memberWithUserInfo = {
        ...updatedMember,
        user: {
          email: "Error loading user",
          full_name: "Error loading user",
          username: "error"
        }
      }
      return jsonResponse(memberWithUserInfo)
    }
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
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
      return errorResponse("Unauthorized" , 401)
    }

    // Check if user is admin of the organization
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !membership || membership.role !== 'admin') {
      return errorResponse("Insufficient permissions" , 403)
    }

    // Get the member to be deleted
    const { data: memberToDelete, error: memberError } = await serviceClient
      .from("organization_members")
      .select("*")
      .eq("id", memberId)
      .eq("organization_id", organizationId)
      .single()

    if (memberError || !memberToDelete) {
      return errorResponse("Member not found" , 404)
    }

    // Prevent admin from deleting themselves
    if (memberToDelete.user_id === user.id) {
      return errorResponse("Cannot remove yourself from the organization" , 400)
    }

    // Delete the member
    const { error: deleteError } = await serviceClient
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", organizationId)

    if (deleteError) {
      logger.error("Error deleting member:", deleteError)
      return errorResponse("Failed to delete member" , 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error("Unexpected error:", error)
    return errorResponse("Internal server error" , 500)
  }
} 